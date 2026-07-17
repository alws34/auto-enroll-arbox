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

function fakeTransporter(calls) {
	return { sendMail: async (opts) => calls.push(opts) };
}

function setup({ withTransporter = true } = {}) {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const sentEmails = [];
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use(
		"/api/me/notifications",
		createNotificationPrefsRoutes({
			usersRepo,
			transporter: withTransporter ? fakeTransporter(sentEmails) : null,
			fromEmailProvider: () => "sender@example.com",
		})
	);
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, usersRepo, user, sentEmails };
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

test("POST /test sends a test email to the user's configured address", async () => {
	const { app, cookie, usersRepo, user, sentEmails } = setup();
	usersRepo.updateNotificationPrefs(user.id, { email: "alon@example.com", emailNotificationsEnabled: true });
	const res = await request(app).post("/api/me/notifications/test").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.sent, true);
	assert.equal(sentEmails.length, 1);
	assert.equal(sentEmails[0].to, "alon@example.com");
});

test("POST /test 400s when the user has no email configured", async () => {
	const { app, cookie } = setup();
	const res = await request(app).post("/api/me/notifications/test").set("Cookie", cookie);
	assert.equal(res.status, 400);
});

test("POST /test 503s when the server has no email transporter configured", async () => {
	const { app, cookie, usersRepo, user } = setup({ withTransporter: false });
	usersRepo.updateNotificationPrefs(user.id, { email: "alon@example.com", emailNotificationsEnabled: true });
	const res = await request(app).post("/api/me/notifications/test").set("Cookie", cookie);
	assert.equal(res.status, 503);
});
