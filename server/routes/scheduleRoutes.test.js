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
const ARBOX_USER_ID = 9454502;

function fakeArboxClient(classes, { cancelCalls, scheduleCalls, cancelResult } = {}) {
	return {
		login: async () => ({ token: "t", refreshToken: "r", fullName: "Alon", arboxUserId: ARBOX_USER_ID }),
		getScheduleBetweenDates: async (token, refreshToken, from, to) => {
			scheduleCalls?.push({ from, to });
			return classes;
		},
		getQuota: async () => ({ used: 4 }),
		getMembership: async () => 999,
		cancel: async (token, refreshToken, args) => {
			cancelCalls?.push(args);
			return cancelResult || { status: 200, body: { data: {} } };
		},
	};
}

function setup(classes, { cancelResult } = {}) {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	const cancelCalls = [];
	const scheduleCalls = [];
	const arboxClient = fakeArboxClient(classes, { cancelCalls, scheduleCalls, cancelResult });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/schedule", createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, usersRepo }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, jobsRepo, usersRepo, cancelCalls, scheduleCalls };
}

test("GET /api/schedule annotates each class with fire_at and quota", async () => {
	const { app, cookie } = setup([
		{
			id: 57247379,
			date: "2026-07-20",
			time: "06:00",
			end_time: "07:00",
			box_categories: { name: "W.O.D Hall A" },
			enable_registration_time: 72,
		},
	]);
	const res = await request(app).get("/api/schedule?days=7").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.classes.length, 1);
	assert.equal(res.body.classes[0].fireAt, "2026-07-17T03:00:00.000Z");
	assert.equal(res.body.classes[0].startUtc, "2026-07-20T03:00:00.000Z");
	assert.equal(res.body.classes[0].endUtc, "2026-07-20T04:00:00.000Z");
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
			end_time: "07:00",
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

test("GET /api/schedule trusts Arbox's user_booked over local DB — shows success even with no local job row", async () => {
	const { app, cookie } = setup([
		{
			id: 999111,
			date: "2026-07-19",
			time: "18:00",
			end_time: "19:00",
			box_categories: { name: "W.O.D Hall A" },
			enable_registration_time: 72,
			user_booked: 176875894,
			user_in_standby: null,
		},
	]);
	const res = await request(app).get("/api/schedule?days=7").set("Cookie", cookie);
	assert.equal(res.body.classes[0].alreadyScheduled, true);
	assert.equal(res.body.classes[0].jobStatus, "success");
	assert.equal(res.body.classes[0].jobId, null); // no local job row exists — booked via the official app
});

test("GET /api/schedule trusts Arbox's user_in_standby as waitlisted", async () => {
	const { app, cookie } = setup([
		{
			id: 999222,
			date: "2026-07-19",
			time: "18:00",
			end_time: "19:00",
			box_categories: { name: "W.O.D Hall A" },
			enable_registration_time: 72,
			user_booked: null,
			user_in_standby: 12345,
		},
	]);
	const res = await request(app).get("/api/schedule?days=7").set("Cookie", cookie);
	assert.equal(res.body.classes[0].jobStatus, "waitlisted");
});

test("DELETE /api/schedule/:scheduleId requires a classDate query param", async () => {
	const { app, cookie } = setup([]);
	const res = await request(app).delete("/api/schedule/999333").set("Cookie", cookie);
	assert.equal(res.status, 400);
});

test("DELETE /api/schedule/:scheduleId resolves the membership that actually owns this booking, not just any active one", async () => {
	const { app, cookie, cancelCalls } = setup([
		{
			id: 999333,
			date: "2026-07-19",
			booked_users: [
				{ id: 111111, membership_user_fk: 5001 }, // someone else
				{ id: ARBOX_USER_ID, membership_user_fk: 16679689 }, // the caller's actual membership for this booking
			],
		},
	]);
	const res = await request(app).delete("/api/schedule/999333?classDate=2026-07-19").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(cancelCalls.length, 1);
	assert.equal(cancelCalls[0].scheduleId, 999333);
	assert.equal(cancelCalls[0].membershipUserId, 16679689); // not the getMembership() stub's 999
});

test("DELETE /api/schedule/:scheduleId 400s when the caller isn't found in the class's booked_users list", async () => {
	const { app, cookie } = setup([
		{ id: 999333, date: "2026-07-19", booked_users: [{ id: 111111, membership_user_fk: 5001 }] },
	]);
	const res = await request(app).delete("/api/schedule/999333?classDate=2026-07-19").set("Cookie", cookie);
	assert.equal(res.status, 400);
});

test("DELETE /api/schedule/:scheduleId returns 400 with Arbox's message on a business-rule rejection (e.g. class already started)", async () => {
	const { app, cookie, jobsRepo, user } = setup(
		[
			{
				id: 999555,
				date: "2026-07-19",
				booked_users: [{ id: ARBOX_USER_ID, membership_user_fk: 16679689 }],
			},
		],
		{
			cancelResult: {
				status: 513,
				body: {
					error: {
						message: "Schedule Exception",
						messageToUser: "W.O.D Hall A has already begun, please register for an upcoming class",
						code: 513,
					},
				},
			},
		}
	);
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 999555,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: "2026-07-16T15:00:00.000Z",
	});
	jobsRepo.updateStatus(job.id, "success", null);

	const res = await request(app).delete("/api/schedule/999555?classDate=2026-07-19").set("Cookie", cookie);
	assert.equal(res.status, 400);
	assert.equal(res.body.error, "W.O.D Hall A has already begun, please register for an upcoming class");
	// Arbox rejected the cancel — the local job must still show success, not cancelled.
	assert.equal(jobsRepo.findByIdUnscoped(job.id).status, "success");
});

test("DELETE /api/schedule/:scheduleId also marks a matching local job cancelled if one exists", async () => {
	const { app, cookie, user, jobsRepo } = setup([
		{
			id: 999444,
			date: "2026-07-19",
			booked_users: [{ id: ARBOX_USER_ID, membership_user_fk: 16679689 }],
		},
	]);
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 999444,
		classDate: "2026-07-19",
		classTime: "18:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: "2026-07-16T15:00:00.000Z",
	});
	jobsRepo.updateStatus(job.id, "success", null);
	await request(app).delete("/api/schedule/999444?classDate=2026-07-19").set("Cookie", cookie);
	assert.equal(jobsRepo.findByIdUnscoped(job.id).status, "cancelled");
});

test("GET /api/schedule honors a ?from= param for browsing other weeks (past or future)", async () => {
	const { app, cookie, scheduleCalls } = setup([]);
	await request(app).get("/api/schedule?days=7&from=2026-08-03").set("Cookie", cookie);
	assert.equal(scheduleCalls.length, 1);
	assert.equal(scheduleCalls[0].from, "2026-08-03T00:00:00.000Z");
	assert.equal(scheduleCalls[0].to, "2026-08-10T00:00:00.000Z");
});
