import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createQuotaRoutes } from "./quotaRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/me/quota", createQuotaRoutes({ usersRepo }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, usersRepo, user };
}

test("GET defaults to 12 for a newly created user", async () => {
	const { app, cookie } = setup();
	const res = await request(app).get("/api/me/quota").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.maxClassesPerMonth, 12);
});

test("PUT updates the value, GET reflects it", async () => {
	const { app, cookie } = setup();
	const putRes = await request(app).put("/api/me/quota").set("Cookie", cookie).send({ maxClassesPerMonth: 20 });
	assert.equal(putRes.status, 200);
	assert.equal(putRes.body.maxClassesPerMonth, 20);
	const getRes = await request(app).get("/api/me/quota").set("Cookie", cookie);
	assert.equal(getRes.body.maxClassesPerMonth, 20);
});

test("PUT rejects non-positive or non-integer values", async () => {
	const { app, cookie } = setup();
	const zero = await request(app).put("/api/me/quota").set("Cookie", cookie).send({ maxClassesPerMonth: 0 });
	assert.equal(zero.status, 400);
	const notNumber = await request(app).put("/api/me/quota").set("Cookie", cookie).send({ maxClassesPerMonth: "abc" });
	assert.equal(notNumber.status, 400);
});

test("users created with an explicit maxClassesPerMonth honor it", async () => {
	const { usersRepo } = setup();
	const user = usersRepo.create({ username: "friend", passwordHash: "h", isAdmin: false, maxClassesPerMonth: 8 });
	assert.equal(usersRepo.findById(user.id).max_classes_per_month, 8);
});
