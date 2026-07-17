import express from "express";

export function createCredentialsRoutes({ credentialsRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		const creds = credentialsRepo.get(req.user.id);
		res.json({ email: creds?.email || null, hasPassword: !!creds });
	});

	router.put("/", (req, res) => {
		const { email, password } = req.body || {};
		if (!email || !password) return res.status(400).json({ error: "email and password are required" });
		credentialsRepo.set(req.user.id, { email, password });
		res.json({ email, hasPassword: true });
	});

	return router;
}
