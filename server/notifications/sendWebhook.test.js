import { test } from "node:test";
import assert from "node:assert/strict";
import { createNotifier } from "./sendWebhook.js";

function fakeFetch(calls) {
	return async (url, opts) => {
		calls.push({ url, body: JSON.parse(opts.body) });
		return { status: 200 };
	};
}

test("posts the event payload to the user's configured webhook URL", async () => {
	const calls = [];
	const webhookRepo = { get: () => "https://x.test/hook" };
	const notify = createNotifier({ webhookRepo, fetchImpl: fakeFetch(calls) });
	await notify(1, "success", { classId: 5, className: "W.O.D", date: "2026-07-20", time: "06:00" });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, "https://x.test/hook");
	assert.equal(calls[0].body.event, "success");
	assert.equal(calls[0].body.className, "W.O.D");
});

test("does nothing when the user has no webhook configured", async () => {
	const calls = [];
	const webhookRepo = { get: () => null };
	const notify = createNotifier({ webhookRepo, fetchImpl: fakeFetch(calls) });
	await notify(1, "success", { classId: 5 });
	assert.equal(calls.length, 0);
});

test("swallows fetch errors so a broken webhook can't crash the scheduler", async () => {
	const webhookRepo = { get: () => "https://x.test/hook" };
	const notify = createNotifier({ webhookRepo, fetchImpl: async () => { throw new Error("network down"); } });
	await assert.doesNotReject(() => notify(1, "success", { classId: 5 }));
});
