import { test } from "node:test";
import assert from "node:assert/strict";
import { asyncHandler } from "./asyncHandler.js";

test("calls next() with no error when the wrapped handler resolves", async () => {
	let called = false;
	const handler = asyncHandler(async (req, res) => {
		called = true;
	});
	const next = (err) => {
		throw new Error(`next should not be called with an error, got: ${err}`);
	};
	await handler({}, {}, next);
	assert.equal(called, true);
});

test("forwards a thrown error to next() instead of letting it hang unhandled", async () => {
	const boom = new Error("boom");
	const handler = asyncHandler(async () => {
		throw boom;
	});
	let passedToNext;
	await handler({}, {}, (err) => {
		passedToNext = err;
	});
	assert.equal(passedToNext, boom);
});

test("forwards a rejected promise to next()", async () => {
	const boom = new Error("rejected");
	const handler = asyncHandler(() => Promise.reject(boom));
	let passedToNext;
	await handler({}, {}, (err) => {
		passedToNext = err;
	});
	assert.equal(passedToNext, boom);
});
