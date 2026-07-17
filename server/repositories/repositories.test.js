import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "./usersRepo.js";
import { createCredentialsRepo } from "./credentialsRepo.js";
import { createWebhookRepo } from "./webhookRepo.js";
import { createJobsRepo } from "./jobsRepo.js";
import { createPasswordResetRepo } from "./passwordResetRepo.js";
import { createAppSettingsRepo } from "./appSettingsRepo.js";

function setup() {
	const db = createDb(":memory:");
	return {
		db,
		usersRepo: createUsersRepo(db),
		credentialsRepo: createCredentialsRepo(db, "test-key"),
		webhookRepo: createWebhookRepo(db),
		jobsRepo: createJobsRepo(db),
		passwordResetRepo: createPasswordResetRepo(db),
		appSettingsRepo: createAppSettingsRepo(db),
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

test("usersRepo: email notifications default on, updateNotificationPrefs, updatePasswordHash", () => {
	const { usersRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	assert.equal(user.email, null);
	assert.equal(user.email_notifications_enabled, 1);

	usersRepo.updateNotificationPrefs(user.id, { email: "alon@example.com", emailNotificationsEnabled: false });
	const updated = usersRepo.findById(user.id);
	assert.equal(updated.email, "alon@example.com");
	assert.equal(updated.email_notifications_enabled, 0);

	usersRepo.updatePasswordHash(user.id, "new-hash");
	assert.equal(usersRepo.findById(user.id).password_hash, "new-hash");
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

test("jobsRepo: markNotified/listUnnotifiedTerminal — pending/cancelled never appear, terminal ones do until marked", () => {
	const { usersRepo, jobsRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const pendingJob = jobsRepo.create({
		userId: user.id,
		scheduleId: 1,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T03:00:00.000Z",
	});
	const successJob = jobsRepo.create({
		userId: user.id,
		scheduleId: 2,
		classDate: "2026-07-20",
		classTime: "07:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T04:00:00.000Z",
	});
	jobsRepo.updateStatus(successJob.id, "success", null);
	const cancelledJob = jobsRepo.create({
		userId: user.id,
		scheduleId: 3,
		classDate: "2026-07-20",
		classTime: "08:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T05:00:00.000Z",
	});
	jobsRepo.updateStatus(cancelledJob.id, "cancelled", null);

	const unnotified = jobsRepo.listUnnotifiedTerminal();
	assert.equal(unnotified.length, 1);
	assert.equal(unnotified[0].id, successJob.id);

	jobsRepo.markNotified(successJob.id);
	assert.equal(jobsRepo.listUnnotifiedTerminal().length, 0);
	assert.ok(jobsRepo.findByIdUnscoped(successJob.id).notified_at);
	assert.equal(pendingJob.notified_at, null);
});

test("passwordResetRepo: create/findValidByToken/markUsed", () => {
	const { usersRepo, passwordResetRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const { token } = passwordResetRepo.create(user.id);
	const found = passwordResetRepo.findValidByToken(token);
	assert.equal(found.user_id, user.id);
	assert.equal(passwordResetRepo.findValidByToken("bogus-token"), undefined);
	passwordResetRepo.markUsed(found.id);
	assert.equal(passwordResetRepo.findValidByToken(token), undefined);
});

test("appSettingsRepo: get/set with fallback", () => {
	const { appSettingsRepo } = setup();
	assert.equal(appSettingsRepo.get("sender_email", "default@x.com"), "default@x.com");
	appSettingsRepo.set("sender_email", "custom@x.com");
	assert.equal(appSettingsRepo.get("sender_email", "default@x.com"), "custom@x.com");
});
