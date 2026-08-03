import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createWorkoutRoutes } from "./workoutRoutes.js";

const JWT_SECRET = "test-secret";

function fakeArboxClient(sections, { workoutCalls } = {}) {
	return {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getWorkoutLogbook: async (token, refreshToken, workoutId) => {
			workoutCalls?.push(workoutId);
			return sections;
		},
	};
}

function setup(sections) {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	const workoutCalls = [];
	const arboxClient = fakeArboxClient(sections, { workoutCalls });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/workout", createWorkoutRoutes({ credentialsRepo, arboxClient }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, workoutCalls };
}

test("GET /api/workout/:workoutId returns the sections from Arbox's logbook", async () => {
	const { app, cookie, workoutCalls } = setup([{ section: "Metcon", text: "20 KB Swings", date: "2026-08-03" }]);
	const res = await request(app).get("/api/workout/310859").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.deepEqual(res.body.sections, [{ section: "Metcon", text: "20 KB Swings", date: "2026-08-03" }]);
	assert.deepEqual(workoutCalls, [310859]);
});

test("GET /api/workout/:workoutId also tags the class with the muscle groups its WOD text implies", async () => {
	const { app, cookie } = setup([{ section: "Metcon", text: "20 KB Swings", date: "2026-08-03" }]);
	const res = await request(app).get("/api/workout/310859").set("Cookie", cookie);
	assert.deepEqual(new Set(res.body.muscleGroups), new Set(["gluteal", "hamstring", "lower-back"]));
});

test("GET /api/workout/:workoutId returns which movement keywords were recognized in the text", async () => {
	const { app, cookie } = setup([{ section: "Metcon", text: "20 KB Swings", date: "2026-08-03" }]);
	const res = await request(app).get("/api/workout/310859").set("Cookie", cookie);
	assert.deepEqual(res.body.matchedMovements, ["kb swing"]);
});

test("GET /api/workout/:workoutId returns an empty muscleGroups list when the text matches no known movement", async () => {
	const { app, cookie } = setup([{ section: "Announcements", text: "Coach's birthday party today!", date: "2026-08-03" }]);
	const res = await request(app).get("/api/workout/310859").set("Cookie", cookie);
	assert.deepEqual(res.body.muscleGroups, []);
});

test("GET /api/workout/:workoutId 400s on a non-numeric id", async () => {
	const { app, cookie } = setup([]);
	const res = await request(app).get("/api/workout/not-a-number").set("Cookie", cookie);
	assert.equal(res.status, 400);
});

test("GET /api/workout/:workoutId 400s when the user has no Arbox credentials configured", async () => {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const user = usersRepo.create({ username: "noCreds", passwordHash: "h", isAdmin: false });
	const arboxClient = fakeArboxClient([]);
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/workout", createWorkoutRoutes({ credentialsRepo, arboxClient }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	const res = await request(app).get("/api/workout/310859").set("Cookie", cookie);
	assert.equal(res.status, 400);
});
