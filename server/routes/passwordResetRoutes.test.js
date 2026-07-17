import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createPasswordResetRepo } from "../repositories/passwordResetRepo.js";
import { verifyPassword } from "../crypto/password.js";
import { createPasswordResetRoutes } from "./passwordResetRoutes.js";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const passwordResetRepo = createPasswordResetRepo(db);
	const user = usersRepo.create({ username: "friend", passwordHash: "old-hash", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use("/api/password-reset", createPasswordResetRoutes({ passwordResetRepo, usersRepo }));
	return { app, usersRepo, passwordResetRepo, user };
}

test("valid token sets the new password and consumes the token", async () => {
	const { app, usersRepo, passwordResetRepo, user } = setup();
	const { token } = passwordResetRepo.create(user.id);

	const res = await request(app).post(`/api/password-reset/${token}`).send({ password: "brand-new-pass" });
	assert.equal(res.status, 200);
	assert.equal(await verifyPassword("brand-new-pass", usersRepo.findById(user.id).password_hash), true);

	// token already used — second attempt must fail
	const secondRes = await request(app).post(`/api/password-reset/${token}`).send({ password: "another-pass" });
	assert.equal(secondRes.status, 400);
});

test("unknown/invalid token is rejected", async () => {
	const { app } = setup();
	const res = await request(app).post("/api/password-reset/not-a-real-token").send({ password: "brand-new-pass" });
	assert.equal(res.status, 400);
});

test("too-short password is rejected", async () => {
	const { app, passwordResetRepo, user } = setup();
	const { token } = passwordResetRepo.create(user.id);
	const res = await request(app).post(`/api/password-reset/${token}`).send({ password: "short" });
	assert.equal(res.status, 400);
});
