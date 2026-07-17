import express from "express";
import { hashPassword } from "../crypto/password.js";

export function createAdminRoutes({ usersRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		res.json(usersRepo.list());
	});

	router.post("/", async (req, res) => {
		const { username, password, isAdmin } = req.body || {};
		if (!username || !password) return res.status(400).json({ error: "username and password are required" });
		if (usersRepo.findByUsername(username)) return res.status(409).json({ error: "Username already exists" });
		const user = usersRepo.create({ username, passwordHash: await hashPassword(password), isAdmin: !!isAdmin });
		res.status(201).json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
	});

	return router;
}
