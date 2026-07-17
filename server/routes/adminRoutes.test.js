import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth, requireAdmin } from "../auth/middleware.js";
import { createAdminRoutes } from "./adminRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const admin = usersRepo.create({ username: "admin", passwordHash: "h", isAdmin: true });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }), requireAdmin);
	app.use("/api/admin/users", createAdminRoutes({ usersRepo }));
	const cookie = `session=${signSession({ id: admin.id, isAdmin: true }, JWT_SECRET)}`;
	return { app, cookie, usersRepo };
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
