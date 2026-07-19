import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { createJobsRepo } from "../repositories/jobsRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createJobsRoutes } from "./jobsRoutes.js";

const JWT_SECRET = "test-secret";
const ARBOX_USER_ID = 9454502;

function setup({ cancelResult } = {}) {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });

	const armedJobs = [];
	const cancelledJobIds = [];
	const cancelCalls = [];
	const scheduler = {
		arm: (job) => armedJobs.push(job.id),
		cancelTimer: (id) => cancelledJobIds.push(id),
	};
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r", arboxUserId: ARBOX_USER_ID }),
		getScheduleBetweenDates: async () => [
			{
				id: 111,
				date: "2026-07-20",
				time: "06:00",
				box_categories: { name: "W.O.D" },
				enable_registration_time: 72,
				booked_users: [{ id: ARBOX_USER_ID, membership_user_fk: 16679689 }],
			},
		],
		getMembership: async () => 999,
		cancel: async (token, refreshToken, args) => {
			cancelCalls.push(args);
			return cancelResult || { status: 200, body: { data: {} } };
		},
	};

	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/jobs", createJobsRoutes({ jobsRepo, credentialsRepo, arboxClient, scheduler }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, jobsRepo, armedJobs, cancelledJobIds, cancelCalls };
}

test("POST /api/jobs creates a job, arms the scheduler, and returns it", async () => {
	const { app, cookie, armedJobs } = setup();
	const res = await request(app).post("/api/jobs").set("Cookie", cookie).send({ scheduleId: 111, classDate: "2026-07-20" });
	assert.equal(res.status, 201);
	assert.equal(res.body.scheduleId, 111);
	assert.equal(res.body.status, "pending");
	assert.equal(armedJobs.length, 1);
});

test("POST /api/jobs 404s when the class can't be found on that date", async () => {
	const { app, cookie } = setup();
	const res = await request(app).post("/api/jobs").set("Cookie", cookie).send({ scheduleId: 999, classDate: "2026-07-20" });
	assert.equal(res.status, 404);
});

test("GET /api/jobs lists the user's jobs", async () => {
	const { app, cookie } = setup();
	await request(app).post("/api/jobs").set("Cookie", cookie).send({ scheduleId: 111, classDate: "2026-07-20" });
	const res = await request(app).get("/api/jobs").set("Cookie", cookie);
	assert.equal(res.body.length, 1);
});

test("DELETE /api/jobs/:id on a pending job cancels the timer and marks cancelled", async () => {
	const { app, cookie, cancelledJobIds } = setup();
	const createRes = await request(app).post("/api/jobs").set("Cookie", cookie).send({ scheduleId: 111, classDate: "2026-07-20" });
	const res = await request(app).delete(`/api/jobs/${createRes.body.id}`).set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.status, "cancelled");
	assert.deepEqual(cancelledJobIds, [createRes.body.id]);
});

test("DELETE /api/jobs/:id on a successful job cancels the real Arbox booking", async () => {
	const { app, cookie, jobsRepo, user } = setup();
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 111,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date().toISOString(),
	});
	jobsRepo.updateStatus(job.id, "success", null);
	const res = await request(app).delete(`/api/jobs/${job.id}`).set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.status, "cancelled");
});

test("DELETE /api/jobs/:id resolves the membership that actually owns this booking, not just any active one", async () => {
	const { app, cookie, jobsRepo, user, cancelCalls } = setup();
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 111,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date().toISOString(),
	});
	jobsRepo.updateStatus(job.id, "success", null);
	await request(app).delete(`/api/jobs/${job.id}`).set("Cookie", cookie);
	assert.equal(cancelCalls.length, 1);
	assert.equal(cancelCalls[0].membershipUserId, 16679689); // not the getMembership() stub's 999
});

test("DELETE /api/jobs/:id returns 400 with Arbox's message on a business-rule rejection, leaves the job as success", async () => {
	const { app, cookie, jobsRepo, user } = setup({
		cancelResult: {
			status: 513,
			body: { error: { messageToUser: "W.O.D Hall A has already begun, please register for an upcoming class" } },
		},
	});
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 111,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date().toISOString(),
	});
	jobsRepo.updateStatus(job.id, "success", null);
	const res = await request(app).delete(`/api/jobs/${job.id}`).set("Cookie", cookie);
	assert.equal(res.status, 400);
	assert.equal(res.body.error, "W.O.D Hall A has already begun, please register for an upcoming class");
	assert.equal(jobsRepo.findByIdUnscoped(job.id).status, "success");
});

test("DELETE /api/jobs/:id 404s for a job that doesn't belong to the caller", async () => {
	const { app, cookie } = setup();
	const res = await request(app).delete("/api/jobs/999999").set("Cookie", cookie);
	assert.equal(res.status, 404);
});
