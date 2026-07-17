import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEnrollResponse } from "./classifyEnrollResponse.js";

test("200 with user_booked set is success", () => {
	const result = classifyEnrollResponse(200, { data: { user_booked: 176875894, user_in_standby: null } });
	assert.equal(result.outcome, "success");
});

test("200 with user_in_standby set (and no user_booked) is waitlisted", () => {
	const result = classifyEnrollResponse(200, { data: { user_booked: null, user_in_standby: 123 } });
	assert.equal(result.outcome, "waitlisted");
});

test("514 Schedule Exception List is terminal, with the user-facing message extracted", () => {
	const body = {
		error: {
			message: "Schedule Exception List",
			messageToUser: [
				{ name: "categoryFrequencyRestricts", message: "You have reached your limit for category registrations." },
			],
			code: 514,
		},
	};
	const result = classifyEnrollResponse(514, body);
	assert.equal(result.outcome, "terminal");
	assert.equal(result.detail, "You have reached your limit for category registrations.");
});

test("500 is transient", () => {
	const result = classifyEnrollResponse(500, { message: "Server Error" });
	assert.equal(result.outcome, "transient");
});

test("503 is transient", () => {
	const result = classifyEnrollResponse(503, {});
	assert.equal(result.outcome, "transient");
});

test("403 with a plain error message is terminal", () => {
	const result = classifyEnrollResponse(403, { message: "Forbidden" });
	assert.equal(result.outcome, "terminal");
	assert.equal(result.detail, "Forbidden");
});
