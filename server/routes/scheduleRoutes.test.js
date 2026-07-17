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
import { createScheduleRoutes } from "./scheduleRoutes.js";

const JWT_SECRET = "test-secret";

function fakeArboxClient(classes) {
	return {
		login: async () => ({ token: "t", refreshToken: "r", fullName: "Alon" }),
		getScheduleBetweenDates: async () => classes,
		getQuota: async () => ({ used: 4 }),
	};
}

function setup(classes) {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	const arboxClient = fakeArboxClient(classes);
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/schedule", createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, usersRepo }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, jobsRepo, usersRepo };
}

test("GET /api/schedule annotates each class with fire_at and quota", async () => {
	const { app, cookie } = setup([
		{
			id: 57247379,
			date: "2026-07-20",
			time: "06:00",
			box_categories: { name: "W.O.D Hall A" },
			enable_registration_time: 72,
		},
	]);
	const res = await request(app).get("/api/schedule?days=7").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.classes.length, 1);
	assert.equal(res.body.classes[0].fireAt, "2026-07-17T03:00:00.000Z");
	assert.equal(res.body.classes[0].alreadyScheduled, false);
	assert.equal(res.body.quota.used, 4);
	assert.equal(res.body.quota.limit, 12);
});

test("GET /api/schedule marks a class already_scheduled when a job exists", async () => {
	const { app, cookie, user, jobsRepo } = setup([
		{
			id: 57247379,
			date: "2026-07-20",
			time: "06:00",
			box_categories: { name: "W.O.D Hall A" },
			enable_registration_time: 72,
		},
	]);
	jobsRepo.create({
		userId: user.id,
		scheduleId: 57247379,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D Hall A",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T03:00:00.000Z",
	});
	const res = await request(app).get("/api/schedule?days=7").set("Cookie", cookie);
	assert.equal(res.body.classes[0].alreadyScheduled, true);
	assert.equal(res.body.classes[0].jobStatus, "pending");
});

test("GET /api/schedule returns 400 when the user has no arbox credentials configured", async () => {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use(
		"/api/schedule",
		createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient: fakeArboxClient([]), usersRepo })
	);
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	const res = await request(app).get("/api/schedule").set("Cookie", cookie);
	assert.equal(res.status, 400);
});
