import express from "express";
import { verifyPassword } from "../crypto/password.js";
import { signSession } from "../auth/jwt.js";

export function createAuthRoutes({ usersRepo, jwtSecret }) {
	const router = express.Router();

	router.post("/login", async (req, res) => {
		const { username, password } = req.body || {};
		const user = usersRepo.findByUsername(username);
		if (!user || !(await verifyPassword(password, user.password_hash))) {
			return res.status(401).json({ error: "Invalid username or password" });
		}
		const token = signSession({ id: user.id, isAdmin: user.is_admin }, jwtSecret);
		res.cookie("session", token, {
			httpOnly: true,
			sameSite: "lax",
			secure: req.secure,
			maxAge: 30 * 24 * 60 * 60 * 1000,
		});
		res.json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
	});

	router.post("/logout", (req, res) => {
		res.clearCookie("session");
		res.status(204).end();
	});

	router.get("/me", (req, res) => {
		const token = req.cookies?.session;
		if (!token) return res.status(401).json({ error: "Not authenticated" });
		res.json({ authenticated: true });
	});

	return router;
}
