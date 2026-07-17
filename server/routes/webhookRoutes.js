import express from "express";

export function createWebhookRoutes({ webhookRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		res.json({ webhookUrl: webhookRepo.get(req.user.id) });
	});

	router.put("/", (req, res) => {
		const { webhookUrl } = req.body || {};
		webhookRepo.set(req.user.id, webhookUrl || null);
		res.json({ webhookUrl: webhookUrl || null });
	});

	return router;
}
