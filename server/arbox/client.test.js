import { test } from "node:test";
import assert from "node:assert/strict";
import { createArboxClient, arboxErrorMessage, findMembershipForBooking } from "./client.js";

function fakeFetch(responses) {
	let call = 0;
	const calls = [];
	const fn = async (url, opts) => {
		calls.push({ url, opts: { ...opts, body: opts.body ? JSON.parse(opts.body) : undefined } });
		const r = responses[call++];
		return { status: r.status, json: async () => r.body };
	};
	fn.calls = calls;
	return fn;
}

test("login sends the whitelabel header and returns token/refreshToken/fullName/arboxUserId", async () => {
	const fetchImpl = fakeFetch([
		{ status: 200, body: { data: { id: 9454502, token: "t1", refreshToken: "r1", full_name: "Alon W" } } },
	]);
	const client = createArboxClient({ fetchImpl });
	const result = await client.login("a@b.com", "pw");
	assert.equal(result.token, "t1");
	assert.equal(result.refreshToken, "r1");
	assert.equal(result.fullName, "Alon W");
	assert.equal(result.arboxUserId, 9454502);
	assert.equal(fetchImpl.calls[0].opts.headers.whitelabel, "hypr-training");
	assert.deepEqual(fetchImpl.calls[0].opts.body, { email: "a@b.com", password: "pw" });
});

test("login throws on non-200", async () => {
	const fetchImpl = fakeFetch([{ status: 403, body: { error: { messageToUser: "hasBrandedApp" } } }]);
	const client = createArboxClient({ fetchImpl });
	await assert.rejects(() => client.login("a@b.com", "wrong"));
});

test("getMembership picks the first active membership", async () => {
	const fetchImpl = fakeFetch([
		{
			status: 200,
			body: {
				data: [
					{ id: 111, active: 0 },
					{ id: 222, active: 1 },
				],
			},
		},
	]);
	const client = createArboxClient({ fetchImpl });
	const membershipId = await client.getMembership("t1", "r1");
	assert.equal(membershipId, 222);
});

test("getMembership throws if no active membership exists", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { data: [{ id: 111, active: 0 }] } }]);
	const client = createArboxClient({ fetchImpl });
	await assert.rejects(() => client.getMembership("t1", "r1"));
});

test("getScheduleBetweenDates returns the class list", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { data: [{ id: 1 }, { id: 2 }] } }]);
	const client = createArboxClient({ fetchImpl });
	const classes = await client.getScheduleBetweenDates("t1", "r1", "2026-07-19T00:00:00.000Z", "2026-07-26T00:00:00.000Z");
	assert.equal(classes.length, 2);
	assert.deepEqual(fetchImpl.calls[0].opts.body, {
		from: "2026-07-19T00:00:00.000Z",
		to: "2026-07-26T00:00:00.000Z",
		locations_box_id: 48,
		boxes_id: 59,
	});
});

test("enroll returns status and body without throwing on non-200 (caller classifies it)", async () => {
	const fetchImpl = fakeFetch([{ status: 514, body: { error: { message: "Schedule Exception List" } } }]);
	const client = createArboxClient({ fetchImpl });
	const result = await client.enroll("t1", "r1", { scheduleId: 5, membershipUserId: 9 });
	assert.equal(result.status, 514);
	assert.equal(result.body.error.message, "Schedule Exception List");
	assert.deepEqual(fetchImpl.calls[0].opts.body, { extras: null, membership_user_id: 9, schedule_id: 5 });
});

test("cancel posts to scheduleUser/delete with schedule_id and membership_user_id, returns status 200 on success", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { data: {} } }]);
	const client = createArboxClient({ fetchImpl });
	const result = await client.cancel("t1", "r1", { scheduleId: 5, membershipUserId: 9 });
	assert.equal(result.status, 200);
	assert.ok(fetchImpl.calls[0].url.endsWith("/scheduleUser/delete"));
	assert.deepEqual(fetchImpl.calls[0].opts.body, { schedule_id: 5, membership_user_id: 9 });
});

test("cancel returns status and body without throwing on a business-rule rejection (caller classifies it)", async () => {
	const fetchImpl = fakeFetch([
		{
			status: 513,
			body: {
				statusCode: 513,
				error: {
					message: "Schedule Exception",
					messageToUser: "W.O.D Hall A has already begun, please register for an upcoming class",
					code: 513,
				},
				data: null,
			},
		},
	]);
	const client = createArboxClient({ fetchImpl });
	const result = await client.cancel("t1", "r1", { scheduleId: 5, membershipUserId: 9 });
	assert.equal(result.status, 513);
	assert.equal(arboxErrorMessage(result.body), "W.O.D Hall A has already begun, please register for an upcoming class");
});

test("arboxErrorMessage handles the array-of-objects messageToUser shape too", () => {
	const body = { error: { message: "Schedule Exception List", messageToUser: [{ message: "limit reached" }] } };
	assert.equal(arboxErrorMessage(body), "limit reached");
});

test("arboxErrorMessage falls back to error.message when messageToUser is absent", () => {
	assert.equal(arboxErrorMessage({ message: "Server Error" }), "Server Error");
});

test("findMembershipForBooking finds the membership tied to this specific user's registration on this class", () => {
	const classObj = {
		booked_users: [
			{ id: 111, membership_user_fk: 5001 },
			{ id: 9454502, membership_user_fk: 16679689 },
			{ id: 222, membership_user_fk: 5002 },
		],
	};
	assert.equal(findMembershipForBooking(classObj, 9454502), 16679689);
});

test("findMembershipForBooking returns null when the user isn't in the booked list", () => {
	const classObj = { booked_users: [{ id: 111, membership_user_fk: 5001 }] };
	assert.equal(findMembershipForBooking(classObj, 9454502), null);
});

test("findMembershipForBooking handles a missing/empty booked_users list", () => {
	assert.equal(findMembershipForBooking({}, 9454502), null);
	assert.equal(findMembershipForBooking({ booked_users: [] }, 9454502), null);
});

test("getQuota returns used = past + future registrations", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { scheduleUserStatus: { results: { past: "3", future: "1" } } } }]);
	const client = createArboxClient({ fetchImpl });
	const quota = await client.getQuota("t1", "r1");
	assert.equal(quota.used, 4);
});

test("getWorkoutLogbook flattens Arbox's deeply-nested response into section/text pairs", async () => {
	// Real shape captured from the official Arbox mobile app (GET
	// /api/v2/logbook/workout/{workoutId}) — nested as data: [[[ {...} ]]].
	const fetchImpl = fakeFetch([
		{
			status: 200,
			body: {
				data: [
					[
						[
							{
								workout_id: 310859,
								name: "2026-08-03",
								comment: "Bulgarian Split Squats\n3 Sets:\n12-10-8 Reps (each leg)",
								box_sections: { id: 443, name: "Metcon" },
							},
						],
					],
				],
			},
		},
	]);
	const client = createArboxClient({ fetchImpl });
	const sections = await client.getWorkoutLogbook("t1", "r1", 310859);
	assert.deepEqual(sections, [
		{ section: "Metcon", text: "Bulgarian Split Squats\n3 Sets:\n12-10-8 Reps (each leg)", date: "2026-08-03" },
	]);
	assert.ok(fetchImpl.calls[0].url.endsWith("/api/v2/logbook/workout/310859"));
});

test("getWorkoutLogbook returns an empty list when a class has no WOD attached", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { data: [] } }]);
	const client = createArboxClient({ fetchImpl });
	const sections = await client.getWorkoutLogbook("t1", "r1", 999);
	assert.deepEqual(sections, []);
});
