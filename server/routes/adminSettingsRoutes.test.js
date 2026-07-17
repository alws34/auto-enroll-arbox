import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createAppSettingsRepo } from "../repositories/appSettingsRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth, requireAdmin } from "../auth/middleware.js";
import { createAdminSettingsRoutes } from "./adminSettingsRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const appSettingsRepo = createAppSettingsRepo(db);
	const admin = usersRepo.create({ username: "admin", passwordHash: "h", isAdmin: true });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }), requireAdmin);
	app.use("/api/admin/settings", createAdminSettingsRoutes({ appSettingsRepo, defaultSenderEmail: "default@example.com" }));
	const cookie = `session=${signSession({ id: admin.id, isAdmin: true }, JWT_SECRET)}`;
	return { app, cookie };
}

test("GET sender-email falls back to the default when unset", async () => {
	const { app, cookie } = setup();
	const res = await request(app).get("/api/admin/settings/sender-email").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.senderEmail, "default@example.com");
});

test("PUT then GET sender-email persists the override", async () => {
	const { app, cookie } = setup();
	const putRes = await request(app)
		.put("/api/admin/settings/sender-email")
		.set("Cookie", cookie)
		.send({ senderEmail: "custom@example.com" });
	assert.equal(putRes.status, 200);
	const getRes = await request(app).get("/api/admin/settings/sender-email").set("Cookie", cookie);
	assert.equal(getRes.body.senderEmail, "custom@example.com");
});

test("PUT rejects an empty senderEmail", async () => {
	const { app, cookie } = setup();
	const res = await request(app).put("/api/admin/settings/sender-email").set("Cookie", cookie).send({});
	assert.equal(res.status, 400);
});
