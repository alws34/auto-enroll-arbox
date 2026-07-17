import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFireAt, classTimesToUtc } from "./fireAt.js";

test("a Sunday 18:00 class with a 72h window opens the preceding Thursday at 18:00 Asia/Jerusalem", () => {
	// 2026-07-19 is a Sunday. Thursday three days prior is 2026-07-16.
	const fireAt = computeFireAt("2026-07-19", "18:00", 72);
	assert.equal(fireAt.toISOString(), "2026-07-16T15:00:00.000Z"); // 18:00 IDT (UTC+3) = 15:00 UTC
});

test("a 48h window subtracts exactly 48 hours", () => {
	const fireAt = computeFireAt("2026-07-20", "06:00", 48);
	assert.equal(fireAt.toISOString(), "2026-07-18T03:00:00.000Z");
});

test("returns a Date instance", () => {
	assert.ok(computeFireAt("2026-07-20", "06:00", 48) instanceof Date);
});

test("classTimesToUtc converts a class's local start/end into UTC ISO strings", () => {
	const { startUtc, endUtc } = classTimesToUtc("2026-07-19", "18:00", "19:00");
	assert.equal(startUtc, "2026-07-19T15:00:00.000Z");
	assert.equal(endUtc, "2026-07-19T16:00:00.000Z");
});
