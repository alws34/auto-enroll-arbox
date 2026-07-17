import express from "express";
import { verifyPassword } from "../crypto/password.js";
import { signSession, signTwoFactorChallenge, verifyTwoFactorChallenge } from "../auth/jwt.js";
import { verifyTotpCode } from "../auth/totp.js";

export function createAuthRoutes({ usersRepo, jwtSecret, totpRepo }) {
	const router = express.Router();

	function setSessionCookie(req, res, user) {
		const token = signSession({ id: user.id, isAdmin: user.is_admin }, jwtSecret);
		res.cookie("session", token, {
			httpOnly: true,
			sameSite: "lax",
			secure: req.secure,
			maxAge: 30 * 24 * 60 * 60 * 1000,
		});
	}

	router.post("/login", async (req, res) => {
		const { username, password } = req.body || {};
		const user = usersRepo.findByUsername(username);
		if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
			return res.status(401).json({ error: "Invalid username or password" });
		}

		const totp = totpRepo.get(user.id);
		if (totp?.enabled) {
			const pendingToken = signTwoFactorChallenge({ id: user.id }, jwtSecret);
			return res.json({ requiresTwoFactor: true, pendingToken });
		}

		setSessionCookie(req, res, user);
		res.json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
	});

	router.post("/login/2fa", (req, res) => {
		const { pendingToken, code } = req.body || {};
		let payload;
		try {
			payload = verifyTwoFactorChallenge(pendingToken, jwtSecret);
		} catch {
			return res.status(401).json({ error: "Two-factor challenge expired or invalid — log in again" });
		}
		const user = usersRepo.findById(payload.id);
		const totp = totpRepo.get(user?.id);
		if (!user || !totp?.enabled || !verifyTotpCode(code, totp.secret)) {
			return res.status(401).json({ error: "Invalid code" });
		}

		setSessionCookie(req, res, user);
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
