import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "./usersRepo.js";
import { createRemindersRepo } from "./remindersRepo.js";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const remindersRepo = createRemindersRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	return { db, user, remindersRepo };
}

test("create/listByUserAndSchedule/countByUserAndSchedule", () => {
	const { user, remindersRepo } = setup();
	assert.equal(remindersRepo.countByUserAndSchedule(user.id, 555), 0);
	remindersRepo.create({
		userId: user.id,
		scheduleId: 555,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: "2026-07-19T14:00:00.000Z",
	});
	assert.equal(remindersRepo.countByUserAndSchedule(user.id, 555), 1);
	const list = remindersRepo.listByUserAndSchedule(user.id, 555);
	assert.equal(list.length, 1);
	assert.equal(list[0].minutes_before, 60);
});

test("UNIQUE constraint rejects a duplicate (user, schedule, minutesBefore)", () => {
	const { user, remindersRepo } = setup();
	const args = {
		userId: user.id,
		scheduleId: 555,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: "2026-07-19T14:00:00.000Z",
	};
	remindersRepo.create(args);
	assert.throws(() => remindersRepo.create(args));
});

test("findById scoped to user, delete", () => {
	const { user, remindersRepo } = setup();
	const r = remindersRepo.create({
		userId: user.id,
		scheduleId: 555,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: "2026-07-19T14:00:00.000Z",
	});
	assert.equal(remindersRepo.findById(r.id, user.id).id, r.id);
	assert.equal(remindersRepo.findById(r.id, 999999), undefined);
	remindersRepo.delete(r.id);
	assert.equal(remindersRepo.findById(r.id, user.id), undefined);
});

test("listDue/markSent", () => {
	const { user, remindersRepo } = setup();
	const past = remindersRepo.create({
		userId: user.id,
		scheduleId: 1,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: new Date(Date.now() - 1000).toISOString(),
	});
	remindersRepo.create({
		userId: user.id,
		scheduleId: 2,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		minutesBefore: 60,
		remindAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
	});
	const due = remindersRepo.listDue();
	assert.equal(due.length, 1);
	assert.equal(due[0].id, past.id);
	remindersRepo.markSent(past.id);
	assert.equal(remindersRepo.listDue().length, 0);
});
