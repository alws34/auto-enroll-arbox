import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createTotpRepo } from "../repositories/totpRepo.js";
import { hashPassword } from "../crypto/password.js";
import { bootstrapAdmin } from "./bootstrapAdmin.js";
import { signSession, verifySession, signTwoFactorChallenge, verifyTwoFactorChallenge } from "./jwt.js";
import { createAuthRoutes } from "../routes/authRoutes.js";
import { requireAuth, requireAdmin } from "./middleware.js";
import { generateTotpSecret, generateTotpCode } from "./totp.js";

const JWT_SECRET = "test-jwt-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const totpRepo = createTotpRepo(db, "enc-key");
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use("/api", createAuthRoutes({ usersRepo, jwtSecret: JWT_SECRET, totpRepo }));
	app.get("/api/protected", requireAuth({ jwtSecret: JWT_SECRET }), (req, res) => res.json({ userId: req.user.id }));
	app.get("/api/admin-only", requireAuth({ jwtSecret: JWT_SECRET }), requireAdmin, (req, res) => res.json({ ok: true }));
	return { db, usersRepo, totpRepo, app };
}

test("bootstrapAdmin creates the admin user only when the users table is empty", async () => {
	const { db, usersRepo } = setup();
	await bootstrapAdmin({ usersRepo, username: "admin", password: "adminpw" });
	assert.equal(usersRepo.count(), 1);
	const admin = usersRepo.findByUsername("admin");
	assert.equal(admin.is_admin, 1);
	await bootstrapAdmin({ usersRepo, username: "admin2", password: "other" });
	assert.equal(usersRepo.count(), 1); // did not create a second one
	db.close();
});

test("signSession/verifySession round-trip", () => {
	const token = signSession({ id: 1, isAdmin: true }, JWT_SECRET);
	const payload = verifySession(token, JWT_SECRET);
	assert.equal(payload.id, 1);
	assert.equal(payload.isAdmin, true);
});

test("POST /api/login with correct credentials sets a session cookie", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const res = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	assert.equal(res.status, 200);
	assert.ok(res.headers["set-cookie"][0].startsWith("session="));
});

test("POST /api/login with wrong password returns 401", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const res = await request(app).post("/api/login").send({ username: "alon", password: "wrong" });
	assert.equal(res.status, 401);
});

test("requireAuth rejects requests without a valid session cookie", async () => {
	const { app } = setup();
	const res = await request(app).get("/api/protected");
	assert.equal(res.status, 401);
});

test("requireAuth allows requests with a valid session cookie", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const loginRes = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	const cookie = loginRes.headers["set-cookie"];
	const res = await request(app).get("/api/protected").set("Cookie", cookie);
	assert.equal(res.status, 200);
});

test("signTwoFactorChallenge/verifyTwoFactorChallenge round-trip", () => {
	const token = signTwoFactorChallenge({ id: 5 }, JWT_SECRET);
	const payload = verifyTwoFactorChallenge(token, JWT_SECRET);
	assert.equal(payload.id, 5);
	assert.equal(payload.stage, "2fa");
});

test("verifyTwoFactorChallenge rejects a regular session token (wrong stage)", () => {
	const sessionToken = signSession({ id: 5, isAdmin: false }, JWT_SECRET);
	assert.throws(() => verifyTwoFactorChallenge(sessionToken, JWT_SECRET));
});

test("login challenges for a code when 2FA is enabled, doesn't set a session cookie yet", async () => {
	const { usersRepo, totpRepo, app } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const secret = generateTotpSecret();
	totpRepo.setPendingSecret(user.id, secret);
	totpRepo.enable(user.id);

	const res = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	assert.equal(res.status, 200);
	assert.equal(res.body.requiresTwoFactor, true);
	assert.ok(res.body.pendingToken);
	assert.equal(res.headers["set-cookie"], undefined);
});

test("POST /api/login/2fa with the right code completes login and sets the session cookie", async () => {
	const { usersRepo, totpRepo, app } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const secret = generateTotpSecret();
	totpRepo.setPendingSecret(user.id, secret);
	totpRepo.enable(user.id);

	const loginRes = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	const res = await request(app)
		.post("/api/login/2fa")
		.send({ pendingToken: loginRes.body.pendingToken, code: generateTotpCode(secret) });
	assert.equal(res.status, 200);
	assert.ok(res.headers["set-cookie"][0].startsWith("session="));
});

test("POST /api/login/2fa with the wrong code is rejected", async () => {
	const { usersRepo, totpRepo, app } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const secret = generateTotpSecret();
	totpRepo.setPendingSecret(user.id, secret);
	totpRepo.enable(user.id);

	const loginRes = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	const res = await request(app).post("/api/login/2fa").send({ pendingToken: loginRes.body.pendingToken, code: "000000" });
	assert.equal(res.status, 401);
});

test("POST /api/login/2fa rejects a garbage/expired pending token", async () => {
	const { app } = setup();
	const res = await request(app).post("/api/login/2fa").send({ pendingToken: "not-a-real-token", code: "123456" });
	assert.equal(res.status, 401);
});

test("GET /api/me returns id/username/isAdmin for a valid session", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: true });
	const loginRes = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	const cookie = loginRes.headers["set-cookie"];
	const res = await request(app).get("/api/me").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.username, "alon");
	assert.equal(res.body.isAdmin, true);
});

test("GET /api/me 401s with no cookie, and with a garbage cookie", async () => {
	const { app } = setup();
	const noCookie = await request(app).get("/api/me");
	assert.equal(noCookie.status, 401);
	const badCookie = await request(app).get("/api/me").set("Cookie", "session=not-a-real-token");
	assert.equal(badCookie.status, 401);
});

test("requireAdmin rejects non-admin users", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const loginRes = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	const cookie = loginRes.headers["set-cookie"];
	const res = await request(app).get("/api/admin-only").set("Cookie", cookie);
	assert.equal(res.status, 403);
});
