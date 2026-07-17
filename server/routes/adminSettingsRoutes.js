import express from "express";

export const SENDER_EMAIL_KEY = "notification_from_email";

export function createAdminSettingsRoutes({ appSettingsRepo, defaultSenderEmail }) {
	const router = express.Router();

	router.get("/sender-email", (req, res) => {
		res.json({ senderEmail: appSettingsRepo.get(SENDER_EMAIL_KEY, defaultSenderEmail) });
	});

	router.put("/sender-email", (req, res) => {
		const { senderEmail } = req.body || {};
		if (!senderEmail) return res.status(400).json({ error: "senderEmail is required" });
		appSettingsRepo.set(SENDER_EMAIL_KEY, senderEmail);
		res.json({ senderEmail });
	});

	return router;
}
