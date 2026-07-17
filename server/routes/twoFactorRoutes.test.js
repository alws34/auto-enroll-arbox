import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createTotpRepo } from "../repositories/totpRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createTwoFactorRoutes } from "./twoFactorRoutes.js";
import { generateTotpCode } from "../auth/totp.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const totpRepo = createTotpRepo(db, "enc-key");
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/me/2fa", createTwoFactorRoutes({ usersRepo, totpRepo }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, totpRepo };
}

test("GET defaults to disabled", async () => {
	const { app, cookie } = setup();
	const res = await request(app).get("/api/me/2fa").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.enabled, false);
});

test("POST /setup returns a secret, otpauth URL, and QR code; stays disabled until confirmed", async () => {
	const { app, cookie, user, totpRepo } = setup();
	const res = await request(app).post("/api/me/2fa/setup").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.ok(res.body.secret);
	assert.match(res.body.otpauthUrl, /^otpauth:\/\/totp\//);
	assert.match(res.body.qrCodeDataUrl, /^data:image\/png;base64,/);
	assert.equal(totpRepo.get(user.id).enabled, false);
});

test("POST /confirm with the right code enables 2FA", async () => {
	const { app, cookie, user, totpRepo } = setup();
	const setupRes = await request(app).post("/api/me/2fa/setup").set("Cookie", cookie);
	const code = generateTotpCode(setupRes.body.secret);
	const res = await request(app).post("/api/me/2fa/confirm").set("Cookie", cookie).send({ code });
	assert.equal(res.status, 200);
	assert.equal(res.body.enabled, true);
	assert.equal(totpRepo.get(user.id).enabled, true);
});

test("POST /confirm with the wrong code fails and leaves 2FA disabled", async () => {
	const { app, cookie, user, totpRepo } = setup();
	await request(app).post("/api/me/2fa/setup").set("Cookie", cookie);
	const res = await request(app).post("/api/me/2fa/confirm").set("Cookie", cookie).send({ code: "000000" });
	assert.equal(res.status, 400);
	assert.equal(totpRepo.get(user.id).enabled, false);
});

test("POST /disable with the right code turns it off", async () => {
	const { app, cookie, user, totpRepo } = setup();
	const setupRes = await request(app).post("/api/me/2fa/setup").set("Cookie", cookie);
	await request(app)
		.post("/api/me/2fa/confirm")
		.set("Cookie", cookie)
		.send({ code: generateTotpCode(setupRes.body.secret) });

	const disableRes = await request(app)
		.post("/api/me/2fa/disable")
		.set("Cookie", cookie)
		.send({ code: generateTotpCode(setupRes.body.secret) });
	assert.equal(disableRes.status, 200);
	assert.equal(disableRes.body.enabled, false);
	assert.equal(totpRepo.get(user.id), null);
});

test("POST /disable 400s when 2FA isn't enabled", async () => {
	const { app, cookie } = setup();
	const res = await request(app).post("/api/me/2fa/disable").set("Cookie", cookie).send({ code: "000000" });
	assert.equal(res.status, 400);
});
