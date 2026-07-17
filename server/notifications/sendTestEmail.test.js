import { test } from "node:test";
import assert from "node:assert/strict";
import { sendTestEmail } from "./sendEmail.js";

test("sends a recognizable test message to the given address", async () => {
	const calls = [];
	const transporter = { sendMail: async (opts) => calls.push(opts) };
	await sendTestEmail({ transporter, fromAddress: "sender@example.com", toEmail: "alon@example.com" });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].to, "alon@example.com");
	assert.equal(calls[0].from, "sender@example.com");
	assert.match(calls[0].text, /test/i);
});
