import { test } from "node:test";
import assert from "node:assert/strict";
import { createCombinedNotifier } from "./notify.js";

test("returns true only when every notifier delivers", async () => {
	const notify = createCombinedNotifier([async () => true, async () => true]);
	assert.equal(await notify(1, "success", {}), true);
});

test("returns false if any notifier fails to deliver", async () => {
	const notify = createCombinedNotifier([async () => true, async () => false]);
	assert.equal(await notify(1, "success", {}), false);
});

test("calls every notifier with the same arguments", async () => {
	const calls = [];
	const notify = createCombinedNotifier([
		async (userId, event, payload) => {
			calls.push(["a", userId, event, payload]);
			return true;
		},
		async (userId, event, payload) => {
			calls.push(["b", userId, event, payload]);
			return true;
		},
	]);
	await notify(7, "waitlisted", { className: "W.O.D" });
	assert.equal(calls.length, 2);
	assert.deepEqual(calls[0], ["a", 7, "waitlisted", { className: "W.O.D" }]);
	assert.deepEqual(calls[1], ["b", 7, "waitlisted", { className: "W.O.D" }]);
});
