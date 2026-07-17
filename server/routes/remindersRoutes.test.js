import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createRemindersRepo } from "../repositories/remindersRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createRemindersRoutes } from "./remindersRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const remindersRepo = createRemindersRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/reminders", createRemindersRoutes({ remindersRepo }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, remindersRepo };
}

const CLASS_ARGS = { scheduleId: 555, classDate: "2026-07-19", classTime: "18:00", className: "W.O.D" };

test("POST creates a reminder, computing remindAt server-side", async () => {
	const { app, cookie } = setup();
	const res = await request(app).post("/api/reminders").set("Cookie", cookie).send({ ...CLASS_ARGS, minutesBefore: 60 });
	assert.equal(res.status, 201);
	assert.equal(res.body.minutesBefore, 60);
	assert.equal(res.body.remindAt, "2026-07-19T14:00:00.000Z");
	assert.equal(res.body.sent, false);
});

test("GET lists reminders for a given class", async () => {
	const { app, cookie } = setup();
	await request(app).post("/api/reminders").set("Cookie", cookie).send({ ...CLASS_ARGS, minutesBefore: 60 });
	const res = await request(app).get(`/api/reminders?scheduleId=${CLASS_ARGS.scheduleId}`).set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.length, 1);
});

test("rejects a 3rd reminder for the same class (cap of 2)", async () => {
	const { app, cookie } = setup();
	await request(app).post("/api/reminders").set("Cookie", cookie).send({ ...CLASS_ARGS, minutesBefore: 60 });
	await request(app).post("/api/reminders").set("Cookie", cookie).send({ ...CLASS_ARGS, minutesBefore: 30 });
	const res = await request(app).post("/api/reminders").set("Cookie", cookie).send({ ...CLASS_ARGS, minutesBefore: 15 });
	assert.equal(res.status, 400);
});

test("rejects a duplicate offset for the same class", async () => {
	const { app, cookie } = setup();
	await request(app).post("/api/reminders").set("Cookie", cookie).send({ ...CLASS_ARGS, minutesBefore: 60 });
	const res = await request(app).post("/api/reminders").set("Cookie", cookie).send({ ...CLASS_ARGS, minutesBefore: 60 });
	assert.equal(res.status, 409);
});

test("DELETE removes a reminder scoped to the caller", async () => {
	const { app, cookie } = setup();
	const createRes = await request(app).post("/api/reminders").set("Cookie", cookie).send({ ...CLASS_ARGS, minutesBefore: 60 });
	const delRes = await request(app).delete(`/api/reminders/${createRes.body.id}`).set("Cookie", cookie);
	assert.equal(delRes.status, 204);
	const listRes = await request(app).get(`/api/reminders?scheduleId=${CLASS_ARGS.scheduleId}`).set("Cookie", cookie);
	assert.equal(listRes.body.length, 0);
});

test("DELETE 404s for a reminder that doesn't belong to the caller", async () => {
	const { app, cookie } = setup();
	const res = await request(app).delete("/api/reminders/999999").set("Cookie", cookie);
	assert.equal(res.status, 404);
});
