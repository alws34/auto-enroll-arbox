import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { createJobsRepo } from "../repositories/jobsRepo.js";
import { createJobScheduler } from "./engine.js";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	return { db, user, credentialsRepo, jobsRepo };
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

test("arm() fires the job at fire_at and records success", async () => {
	const { user, credentialsRepo, jobsRepo } = setup();
	const notified = [];
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => ({ status: 200, body: { data: { user_booked: 123, user_in_standby: null } } }),
	};
	const scheduler = createJobScheduler({
		jobsRepo,
		credentialsRepo,
		arboxClient,
		notify: async (userId, event, payload) => notified.push({ userId, event, payload }),
		retryIntervalMs: 10,
		retryWindowMs: 50,
	});
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 1,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 60).toISOString(),
	});
	scheduler.arm(job);
	await sleep(300);
	assert.equal(jobsRepo.findByIdUnscoped(job.id).status, "success");
	assert.equal(notified.length, 1);
	assert.equal(notified[0].event, "success");
});

test("arm() retries on transient failure then succeeds", async () => {
	const { user, jobsRepo, credentialsRepo } = setup();
	let attempts = 0;
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => {
			attempts++;
			if (attempts < 3) return { status: 500, body: {} };
			return { status: 200, body: { data: { user_booked: 1, user_in_standby: null } } };
		},
	};
	const scheduler = createJobScheduler({
		jobsRepo,
		credentialsRepo,
		arboxClient,
		notify: async () => {},
		retryIntervalMs: 10,
		retryWindowMs: 200,
	});
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 2,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 30).toISOString(),
	});
	scheduler.arm(job);
	await sleep(300);
	assert.ok(attempts >= 3);
	assert.equal(jobsRepo.findByIdUnscoped(job.id).status, "success");
});

test("arm() stops immediately on a terminal (business-rule) rejection", async () => {
	const { user, jobsRepo, credentialsRepo } = setup();
	let attempts = 0;
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => {
			attempts++;
			return { status: 514, body: { error: { messageToUser: [{ message: "limit reached" }] } } };
		},
	};
	const scheduler = createJobScheduler({
		jobsRepo,
		credentialsRepo,
		arboxClient,
		notify: async () => {},
		retryIntervalMs: 10,
		retryWindowMs: 200,
	});
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 3,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 30).toISOString(),
	});
	scheduler.arm(job);
	await sleep(300);
	assert.equal(attempts, 1);
	const finalJob = jobsRepo.findByIdUnscoped(job.id);
	assert.equal(finalJob.status, "failed");
	assert.equal(finalJob.result_detail, "limit reached");
});

test("cancelTimer prevents a not-yet-fired job from firing", async () => {
	const { user, jobsRepo, credentialsRepo } = setup();
	let attempts = 0;
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => {
			attempts++;
			return { status: 200, body: { data: { user_booked: 1 } } };
		},
	};
	const scheduler = createJobScheduler({ jobsRepo, credentialsRepo, arboxClient, notify: async () => {} });
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 4,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 100).toISOString(),
	});
	scheduler.arm(job);
	scheduler.cancelTimer(job.id);
	await sleep(300);
	assert.equal(attempts, 0);
});

test("boot() re-arms pending jobs with a future fire_at, and marks past-due ones missed", async () => {
	const { user, jobsRepo, credentialsRepo } = setup();
	const notified = [];
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => ({ status: 200, body: { data: { user_booked: 1 } } }),
	};
	const futureJob = jobsRepo.create({
		userId: user.id,
		scheduleId: 5,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 50).toISOString(),
	});
	const pastJob = jobsRepo.create({
		userId: user.id,
		scheduleId: 6,
		classDate: "2026-07-18",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() - 5000).toISOString(),
	});
	const scheduler = createJobScheduler({
		jobsRepo,
		credentialsRepo,
		arboxClient,
		notify: async (userId, event, payload) => notified.push({ event, payload }),
	});
	scheduler.boot();
	await sleep(300);
	assert.equal(jobsRepo.findByIdUnscoped(futureJob.id).status, "success");
	assert.equal(jobsRepo.findByIdUnscoped(pastJob.id).status, "missed");
	assert.ok(notified.some((n) => n.event === "missed"));
});
