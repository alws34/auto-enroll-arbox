import nodemailer from "nodemailer";

const SUBJECTS = {
	success: "Enrolled",
	waitlisted: "Waitlisted",
	failed: "Enrollment failed",
	missed: "Signup missed",
	reminder: "Class reminder",
};

function formatBody(event, payload, username) {
	const { className, date, time, detail, minutesBefore } = payload;
	const base = `${className} on ${date} at ${time}`;
	const greeting = `Hi ${username || "there"},`;
	let message;
	switch (event) {
		case "success":
			message = `You're enrolled: ${base}.`;
			break;
		case "waitlisted":
			message = `You're on the waitlist: ${base}. Arbox will email you directly if a spot opens up.`;
			break;
		case "failed":
			message = `Enrollment failed: ${base}.${detail ? ` Reason: ${detail}` : ""}`;
			break;
		case "missed":
			message = `Missed the registration window: ${base}.${detail ? ` ${detail}` : ""}`;
			break;
		case "reminder":
			message = `Reminder: ${base} — starting in ${minutesBefore} minutes.`;
			break;
		default:
			message = `${event}: ${base}.${detail ? ` ${detail}` : ""}`;
	}
	return `${greeting}\n\n${message}`;
}

export function createEmailNotifier({ transporter, usersRepo, fromEmailProvider }) {
	return async function notify(userId, event, payload) {
		const user = usersRepo.findById(userId);
		if (!user?.email || !user.email_notifications_enabled) return true;
		try {
			await transporter.sendMail({
				from: fromEmailProvider(),
				to: user.email,
				subject: SUBJECTS[event] || `Arbox: ${event}`,
				text: formatBody(event, payload, user.username),
			});
			return true;
		} catch (err) {
			console.log(`Email notification failed for user ${userId}:`, err.message);
			return false;
		}
	};
}

export async function sendPasswordResetEmail({ transporter, fromAddress, toEmail, resetLink }) {
	await transporter.sendMail({
		from: fromAddress,
		to: toEmail,
		subject: "Reset your password",
		text: `Reset your password using this link (valid for 1 hour): ${resetLink}`,
	});
}

export async function sendInviteEmail({ transporter, fromAddress, toEmail, inviteLink }) {
	await transporter.sendMail({
		from: fromAddress,
		to: toEmail,
		subject: "You've been invited",
		text: `You've been invited to the Arbox auto-enroll app. Set your password to finish signing up (link valid for 7 days): ${inviteLink}`,
	});
}

export async function sendTestEmail({ transporter, fromAddress, toEmail }) {
	await transporter.sendMail({
		from: fromAddress,
		to: toEmail,
		subject: "Test notification",
		text: "This is a test email from your Arbox auto-enroll app. If you received this, email notifications are working.",
	});
}

export function createGmailTransporter({ user, appPassword }) {
	return nodemailer.createTransport({
		service: "gmail",
		auth: { user, pass: appPassword },
	});
}
