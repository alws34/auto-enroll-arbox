import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { hashPassword } from "../crypto/password.js";
import { bootstrapAdmin } from "./bootstrapAdmin.js";
import { signSession, verifySession } from "./jwt.js";
import { createAuthRoutes } from "../routes/authRoutes.js";
import { requireAuth, requireAdmin } from "./middleware.js";

const JWT_SECRET = "test-jwt-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use("/api", createAuthRoutes({ usersRepo, jwtSecret: JWT_SECRET }));
	app.get("/api/protected", requireAuth({ jwtSecret: JWT_SECRET }), (req, res) => res.json({ userId: req.user.id }));
	app.get("/api/admin-only", requireAuth({ jwtSecret: JWT_SECRET }), requireAdmin, (req, res) => res.json({ ok: true }));
	return { db, usersRepo, app };
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

test("requireAdmin rejects non-admin users", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const loginRes = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	const cookie = loginRes.headers["set-cookie"];
	const res = await request(app).get("/api/admin-only").set("Cookie", cookie);
	assert.equal(res.status, 403);
});
