import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createPasswordResetRepo } from "../repositories/passwordResetRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth, requireAdmin } from "../auth/middleware.js";
import { createAdminRoutes } from "./adminRoutes.js";

const JWT_SECRET = "test-secret";

function fakeTransporter(calls, shouldThrow = false) {
	return {
		sendMail: async (opts) => {
			if (shouldThrow) throw new Error("smtp down");
			calls.push(opts);
			return { messageId: "fake" };
		},
	};
}

function setup({ withEmail = true } = {}) {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const passwordResetRepo = createPasswordResetRepo(db);
	const admin = usersRepo.create({ username: "admin", passwordHash: "h", isAdmin: true });
	const sentEmails = [];
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }), requireAdmin);
	app.use(
		"/api/admin/users",
		createAdminRoutes({
			usersRepo,
			passwordResetRepo,
			transporter: fakeTransporter(sentEmails),
			fromEmailProvider: () => "sender@example.com",
			appBaseUrl: "https://app.example.com",
		})
	);
	const cookie = `session=${signSession({ id: admin.id, isAdmin: true }, JWT_SECRET)}`;
	return { app, cookie, usersRepo, passwordResetRepo, sentEmails };
}

test("GET /api/admin/users lists accounts without password hashes", async () => {
	const { app, cookie } = setup();
	const res = await request(app).get("/api/admin/users").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.length, 1);
	assert.equal(res.body[0].username, "admin");
	assert.equal(res.body[0].password_hash, undefined);
});

test("POST /api/admin/users creates a new account", async () => {
	const { app, cookie, usersRepo } = setup();
	const res = await request(app).post("/api/admin/users").set("Cookie", cookie).send({ username: "friend", password: "friendpw" });
	assert.equal(res.status, 201);
	assert.equal(res.body.username, "friend");
	assert.ok(usersRepo.findByUsername("friend"));
});

test("POST /api/admin/users rejects a duplicate username", async () => {
	const { app, cookie } = setup();
	await request(app).post("/api/admin/users").set("Cookie", cookie).send({ username: "friend", password: "pw1" });
	const res = await request(app).post("/api/admin/users").set("Cookie", cookie).send({ username: "friend", password: "pw2" });
	assert.equal(res.status, 409);
});

test("POST /:id/send-reset emails a reset link when the target user has an email", async () => {
	const { app, cookie, usersRepo, sentEmails } = setup();
	const friend = usersRepo.create({ username: "friend", passwordHash: "h", isAdmin: false, email: "friend@example.com" });
	const res = await request(app).post(`/api/admin/users/${friend.id}/send-reset`).set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.sent, true);
	assert.equal(sentEmails.length, 1);
	assert.equal(sentEmails[0].to, "friend@example.com");
	assert.match(sentEmails[0].text, /https:\/\/app\.example\.com\/reset-password\?token=/);
});

test("POST /:id/send-reset 400s when the target user has no email configured", async () => {
	const { app, cookie, usersRepo } = setup();
	const friend = usersRepo.create({ username: "friend", passwordHash: "h", isAdmin: false });
	const res = await request(app).post(`/api/admin/users/${friend.id}/send-reset`).set("Cookie", cookie);
	assert.equal(res.status, 400);
});

test("POST /:id/send-reset 404s for an unknown user id", async () => {
	const { app, cookie } = setup();
	const res = await request(app).post("/api/admin/users/999999/send-reset").set("Cookie", cookie);
	assert.equal(res.status, 404);
});
