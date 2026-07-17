import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createNotificationPrefsRoutes } from "./notificationPrefsRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/me/notifications", createNotificationPrefsRoutes({ usersRepo }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, usersRepo, user };
}

test("GET defaults to enabled, no email", async () => {
	const { app, cookie } = setup();
	const res = await request(app).get("/api/me/notifications").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.email, null);
	assert.equal(res.body.emailNotificationsEnabled, true);
});

test("PUT updates email and can disable notifications", async () => {
	const { app, cookie } = setup();
	const res = await request(app)
		.put("/api/me/notifications")
		.set("Cookie", cookie)
		.send({ email: "alon@example.com", emailNotificationsEnabled: false });
	assert.equal(res.status, 200);
	assert.equal(res.body.email, "alon@example.com");
	assert.equal(res.body.emailNotificationsEnabled, false);

	const getRes = await request(app).get("/api/me/notifications").set("Cookie", cookie);
	assert.equal(getRes.body.email, "alon@example.com");
	assert.equal(getRes.body.emailNotificationsEnabled, false);
});
