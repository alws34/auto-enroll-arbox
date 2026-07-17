import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmailNotifier, sendPasswordResetEmail, sendInviteEmail } from "./sendEmail.js";

function fakeTransporter(calls, shouldThrow = false) {
	return {
		sendMail: async (opts) => {
			if (shouldThrow) throw new Error("smtp down");
			calls.push(opts);
			return { messageId: "fake" };
		},
	};
}

test("sends an email to the user's address, returns true", async () => {
	const calls = [];
	const usersRepo = { findById: () => ({ email: "alon@example.com", email_notifications_enabled: 1 }) };
	const notify = createEmailNotifier({
		transporter: fakeTransporter(calls),
		usersRepo,
		fromEmailProvider: () => "sender@example.com",
	});
	const delivered = await notify(1, "success", { className: "W.O.D", date: "2026-07-20", time: "06:00" });
	assert.equal(delivered, true);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].to, "alon@example.com");
	assert.equal(calls[0].from, "sender@example.com");
	assert.match(calls[0].text, /W\.O\.D/);
});

test("does nothing and returns true when the user has no email set", async () => {
	const calls = [];
	const usersRepo = { findById: () => ({ email: null, email_notifications_enabled: 1 }) };
	const notify = createEmailNotifier({ transporter: fakeTransporter(calls), usersRepo, fromEmailProvider: () => "s@x.com" });
	const delivered = await notify(1, "success", { className: "W.O.D" });
	assert.equal(delivered, true);
	assert.equal(calls.length, 0);
});

test("does nothing and returns true when the user opted out of email notifications", async () => {
	const calls = [];
	const usersRepo = { findById: () => ({ email: "alon@example.com", email_notifications_enabled: 0 }) };
	const notify = createEmailNotifier({ transporter: fakeTransporter(calls), usersRepo, fromEmailProvider: () => "s@x.com" });
	const delivered = await notify(1, "success", { className: "W.O.D" });
	assert.equal(delivered, true);
	assert.equal(calls.length, 0);
});

test("returns false when sendMail throws", async () => {
	const usersRepo = { findById: () => ({ email: "alon@example.com", email_notifications_enabled: 1 }) };
	const notify = createEmailNotifier({
		transporter: fakeTransporter([], true),
		usersRepo,
		fromEmailProvider: () => "s@x.com",
	});
	const delivered = await notify(1, "success", { className: "W.O.D" });
	assert.equal(delivered, false);
});

test("waitlisted event mentions Arbox will email about the outcome", async () => {
	const calls = [];
	const usersRepo = { findById: () => ({ email: "alon@example.com", email_notifications_enabled: 1 }) };
	const notify = createEmailNotifier({
		transporter: fakeTransporter(calls),
		usersRepo,
		fromEmailProvider: () => "s@x.com",
	});
	await notify(1, "waitlisted", { className: "W.O.D", date: "2026-07-20", time: "06:00" });
	assert.match(calls[0].text, /waitlist/i);
});

test("sendPasswordResetEmail sends a link to the target address", async () => {
	const calls = [];
	await sendPasswordResetEmail({
		transporter: fakeTransporter(calls),
		fromAddress: "sender@example.com",
		toEmail: "friend@example.com",
		resetLink: "https://app.example.com/reset-password?token=abc123",
	});
	assert.equal(calls.length, 1);
	assert.equal(calls[0].to, "friend@example.com");
	assert.match(calls[0].text, /abc123/);
});

test("sendInviteEmail sends the invite link to the target address", async () => {
	const calls = [];
	await sendInviteEmail({
		transporter: fakeTransporter(calls),
		fromAddress: "sender@example.com",
		toEmail: "friend@example.com",
		inviteLink: "https://app.example.com/reset-password?token=xyz789",
	});
	assert.equal(calls.length, 1);
	assert.equal(calls[0].to, "friend@example.com");
	assert.match(calls[0].text, /xyz789/);
	assert.match(calls[0].text, /invited/i);
});
