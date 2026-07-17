import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createRemindersRepo } from "../repositories/remindersRepo.js";
import { createReminderEngine } from "./reminderEngine.js";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const remindersRepo = createRemindersRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	return { db, user, remindersRepo };
}

test("tick() delivers due reminders and marks them sent, skips ones still in the future", async () => {
	const { user, remindersRepo } = setup();
	const due = remindersRepo.create({
		userId: user.id,
		scheduleId: 1,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: new Date(Date.now() - 1000).toISOString(),
	});
	const future = remindersRepo.create({
		userId: user.id,
		scheduleId: 2,
		classDate: "2026-07-20",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: new Date(Date.now() + 3600_000).toISOString(),
	});

	const notified = [];
	const engine = createReminderEngine({
		remindersRepo,
		notify: async (userId, event, payload) => {
			notified.push({ userId, event, payload });
			return true;
		},
	});
	await engine.tick();

	assert.equal(notified.length, 1);
	assert.equal(notified[0].event, "reminder");
	assert.equal(notified[0].payload.minutesBefore, 60);
	assert.ok(remindersRepo.findById(due.id, user.id).sent_at);
	assert.equal(remindersRepo.findById(future.id, user.id).sent_at, null);
});

test("tick() does not mark a reminder sent if notify fails to deliver", async () => {
	const { user, remindersRepo } = setup();
	const reminder = remindersRepo.create({
		userId: user.id,
		scheduleId: 1,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: new Date(Date.now() - 1000).toISOString(),
	});
	const engine = createReminderEngine({ remindersRepo, notify: async () => false });
	await engine.tick();
	assert.equal(remindersRepo.findById(reminder.id, user.id).sent_at, null);
});

test("start()/stop() run tick() on the configured interval without throwing", async () => {
	const { user, remindersRepo } = setup();
	remindersRepo.create({
		userId: user.id,
		scheduleId: 1,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: new Date(Date.now() - 1000).toISOString(),
	});
	let calls = 0;
	const engine = createReminderEngine({
		remindersRepo,
		notify: async () => {
			calls++;
			return true;
		},
		pollIntervalMs: 20,
	});
	engine.start();
	await new Promise((resolve) => setTimeout(resolve, 60));
	engine.stop();
	assert.ok(calls >= 1);
});
