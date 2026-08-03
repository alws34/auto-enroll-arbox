import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { createJobsRepo } from "../repositories/jobsRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createTrainingRoutes } from "./trainingRoutes.js";

const JWT_SECRET = "test-secret";

function fakeArboxClient(classes, { workoutsById = {}, scheduleCalls, workoutCalls } = {}) {
	return {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getScheduleBetweenDates: async (token, refreshToken, from, to) => {
			scheduleCalls?.push({ from, to });
			return classes;
		},
		getWorkoutLogbook: async (token, refreshToken, workoutId) => {
			workoutCalls?.push(workoutId);
			if (workoutsById[workoutId] === "error") throw new Error("Arbox workout fetch failed");
			return workoutsById[workoutId] || [];
		},
	};
}

function setup(classes, opts = {}) {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	const scheduleCalls = [];
	const workoutCalls = [];
	const arboxClient = fakeArboxClient(classes, { ...opts, scheduleCalls, workoutCalls });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/training", createTrainingRoutes({ credentialsRepo, jobsRepo, arboxClient }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, jobsRepo, scheduleCalls, workoutCalls };
}

test("GET /api/training/coverage only counts booked/waitlisted classes, ignores ones just browsed", async () => {
	const { app, cookie } = setup([
		{ id: 1, date: "2026-08-04", box_categories: { name: "PUMP Hall B" }, user_booked: 55, workout_id: null },
		{ id: 2, date: "2026-08-05", box_categories: { name: "W.O.D Hall A" }, user_booked: null, user_in_standby: null, workout_id: null },
	]);
	const res = await request(app).get("/api/training/coverage?days=7").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.breakdown.length, 1);
	assert.equal(res.body.breakdown[0].id, 1);
});

test("GET /api/training/coverage fetches WOD text for booked classes that have a workout_id and uses it", async () => {
	const { app, cookie, workoutCalls } = setup(
		[{ id: 1, date: "2026-08-04", box_categories: { name: "W.O.D Hall A" }, user_booked: 55, workout_id: 999 }],
		{ workoutsById: { 999: [{ section: "Metcon", text: "Deadlift 5x5, Pull-ups", date: "2026-08-04" }] } }
	);
	const res = await request(app).get("/api/training/coverage?days=7").set("Cookie", cookie);
	assert.deepEqual(workoutCalls, [999]);
	assert.equal(res.body.breakdown[0].source, "wod");
	assert.deepEqual(new Set(res.body.breakdown[0].muscleGroups), new Set(["lower-back", "hamstring", "gluteal", "upper-back", "biceps", "forearm"]));
	assert.equal(res.body.totals["lower-back"], 1);
});

test("GET /api/training/coverage falls back to category when a class has no workout_id", async () => {
	const { app, cookie } = setup([
		{ id: 1, date: "2026-08-04", box_categories: { name: "Gymnastics Hall B" }, user_booked: 55, workout_id: null },
	]);
	const res = await request(app).get("/api/training/coverage?days=7").set("Cookie", cookie);
	assert.equal(res.body.breakdown[0].source, "category");
	assert.deepEqual(new Set(res.body.breakdown[0].muscleGroups), new Set(["abs", "front-deltoids", "biceps", "upper-back"]));
});

test("GET /api/training/coverage doesn't fail the whole week if one class's WOD fetch errors", async () => {
	const { app, cookie } = setup(
		[{ id: 1, date: "2026-08-04", box_categories: { name: "PUMP Hall B" }, user_booked: 55, workout_id: 999 }],
		{ workoutsById: { 999: "error" } }
	);
	const res = await request(app).get("/api/training/coverage?days=7").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.breakdown[0].source, "category"); // fell back cleanly
});

test("GET /api/training/coverage returns 400 when the user has no arbox credentials configured", async () => {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "noCreds", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/training", createTrainingRoutes({ credentialsRepo, jobsRepo, arboxClient: fakeArboxClient([]) }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	const res = await request(app).get("/api/training/coverage").set("Cookie", cookie);
	assert.equal(res.status, 400);
});

test("GET /api/training/coverage honors a ?from= param for browsing other weeks", async () => {
	const { app, cookie, scheduleCalls } = setup([]);
	await request(app).get("/api/training/coverage?days=7&from=2026-08-03").set("Cookie", cookie);
	assert.equal(scheduleCalls.length, 1);
	assert.equal(scheduleCalls[0].from, "2026-08-03T00:00:00.000Z");
	assert.equal(scheduleCalls[0].to, "2026-08-10T00:00:00.000Z");
});
