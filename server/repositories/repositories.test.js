import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "./usersRepo.js";
import { createCredentialsRepo } from "./credentialsRepo.js";
import { createWebhookRepo } from "./webhookRepo.js";
import { createJobsRepo } from "./jobsRepo.js";

function setup() {
	const db = createDb(":memory:");
	return {
		db,
		usersRepo: createUsersRepo(db),
		credentialsRepo: createCredentialsRepo(db, "test-key"),
		webhookRepo: createWebhookRepo(db),
		jobsRepo: createJobsRepo(db),
	};
}

test("usersRepo: create, findByUsername, findById, count, list", () => {
	const { usersRepo } = setup();
	assert.equal(usersRepo.count(), 0);
	const user = usersRepo.create({ username: "alon", passwordHash: "hash1", isAdmin: true });
	assert.equal(usersRepo.count(), 1);
	assert.equal(usersRepo.findByUsername("alon").id, user.id);
	assert.equal(usersRepo.findById(user.id).username, "alon");
	assert.equal(usersRepo.list().length, 1);
	assert.equal(usersRepo.findByUsername("nope"), undefined);
});

test("credentialsRepo: set/get round-trips and decrypts the password", () => {
	const { usersRepo, credentialsRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	assert.equal(credentialsRepo.get(user.id), undefined);
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	const creds = credentialsRepo.get(user.id);
	assert.equal(creds.email, "a@b.com");
	assert.equal(creds.password, "gympw");
});

test("webhookRepo: set/get", () => {
	const { usersRepo, webhookRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	assert.equal(webhookRepo.get(user.id), null);
	webhookRepo.set(user.id, "https://example.com/hook");
	assert.equal(webhookRepo.get(user.id), "https://example.com/hook");
});

test("jobsRepo: create, listByUser, listPending, findById scoped to user, updateStatus", () => {
	const { usersRepo, jobsRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 555,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D Hall A",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T03:00:00.000Z",
	});
	assert.equal(job.status, "pending");
	assert.equal(jobsRepo.listByUser(user.id).length, 1);
	assert.equal(jobsRepo.listPending().length, 1);
	assert.equal(jobsRepo.findById(job.id, user.id).id, job.id);
	assert.equal(jobsRepo.findById(job.id, 999999), undefined);
	jobsRepo.updateStatus(job.id, "success", null);
	assert.equal(jobsRepo.findById(job.id, user.id).status, "success");
	assert.equal(jobsRepo.listPending().length, 0);
});

test("jobsRepo: findActiveByUserAndScheduleIds returns a map for already-scheduled annotation", () => {
	const { usersRepo, jobsRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	jobsRepo.create({
		userId: user.id,
		scheduleId: 555,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T03:00:00.000Z",
	});
	const map = jobsRepo.findActiveByUserAndScheduleIds(user.id, [555, 999]);
	assert.equal(map.get(555).status, "pending");
	assert.equal(map.has(999), false);
});
