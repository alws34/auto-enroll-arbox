import express from "express";
import { sendTestEmail } from "../notifications/sendEmail.js";

export function createNotificationPrefsRoutes({ usersRepo, transporter, fromEmailProvider }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		const user = usersRepo.findById(req.user.id);
		res.json({ email: user.email, emailNotificationsEnabled: !!user.email_notifications_enabled });
	});

	router.put("/", (req, res) => {
		const { email, emailNotificationsEnabled } = req.body || {};
		usersRepo.updateNotificationPrefs(req.user.id, {
			email: email || null,
			emailNotificationsEnabled: emailNotificationsEnabled !== false,
		});
		res.json({ email: email || null, emailNotificationsEnabled: emailNotificationsEnabled !== false });
	});

	router.post("/test", async (req, res) => {
		const user = usersRepo.findById(req.user.id);
		if (!user.email) return res.status(400).json({ error: "Set a notification email first" });
		if (!transporter) return res.status(503).json({ error: "Email is not configured on this server" });
		await sendTestEmail({ transporter, fromAddress: fromEmailProvider(), toEmail: user.email });
		res.json({ sent: true });
	});

	return router;
}
