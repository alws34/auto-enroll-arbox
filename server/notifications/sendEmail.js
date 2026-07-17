import nodemailer from "nodemailer";

const SUBJECTS = {
	success: "Enrolled",
	waitlisted: "Waitlisted",
	failed: "Enrollment failed",
	missed: "Signup missed",
};

function formatBody(event, payload) {
	const { className, date, time, detail } = payload;
	const base = `${className} on ${date} at ${time}`;
	switch (event) {
		case "success":
			return `You're enrolled: ${base}.`;
		case "waitlisted":
			return `You're on the waitlist: ${base}. Arbox will email you directly if a spot opens up.`;
		case "failed":
			return `Enrollment failed: ${base}.${detail ? ` Reason: ${detail}` : ""}`;
		case "missed":
			return `Missed the registration window: ${base}.${detail ? ` ${detail}` : ""}`;
		default:
			return `${event}: ${base}.${detail ? ` ${detail}` : ""}`;
	}
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
				text: formatBody(event, payload),
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
