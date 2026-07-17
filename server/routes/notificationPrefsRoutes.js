import express from "express";

export function createNotificationPrefsRoutes({ usersRepo }) {
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

	return router;
}
