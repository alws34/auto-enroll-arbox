import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { createWebhookRepo } from "../repositories/webhookRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createCredentialsRoutes } from "./credentialsRoutes.js";
import { createWebhookRoutes } from "./webhookRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const webhookRepo = createWebhookRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/me/arbox-credentials", createCredentialsRoutes({ credentialsRepo }));
	app.use("/api/me/webhook", createWebhookRoutes({ webhookRepo }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user };
}

test("GET credentials before any are set returns hasPassword: false", async () => {
	const { app, cookie } = setup();
	const res = await request(app).get("/api/me/arbox-credentials").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.hasPassword, false);
});

test("PUT then GET credentials never exposes the raw or encrypted password", async () => {
	const { app, cookie } = setup();
	const putRes = await request(app)
		.put("/api/me/arbox-credentials")
		.set("Cookie", cookie)
		.send({ email: "a@b.com", password: "gympw" });
	assert.equal(putRes.status, 200);
	const getRes = await request(app).get("/api/me/arbox-credentials").set("Cookie", cookie);
	assert.equal(getRes.body.email, "a@b.com");
	assert.equal(getRes.body.hasPassword, true);
	assert.equal(getRes.body.password, undefined);
});

test("webhook GET/PUT round-trips the URL", async () => {
	const { app, cookie } = setup();
	const getBefore = await request(app).get("/api/me/webhook").set("Cookie", cookie);
	assert.equal(getBefore.body.webhookUrl, null);
	await request(app).put("/api/me/webhook").set("Cookie", cookie).send({ webhookUrl: "https://x.test/hook" });
	const getAfter = await request(app).get("/api/me/webhook").set("Cookie", cookie);
	assert.equal(getAfter.body.webhookUrl, "https://x.test/hook");
});
