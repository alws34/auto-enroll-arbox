import express from "express";
import { verifyPassword } from "../crypto/password.js";
import { signSession, verifySession, signTwoFactorChallenge, verifyTwoFactorChallenge } from "../auth/jwt.js";
import { verifyTotpCode } from "../auth/totp.js";
import { asyncHandler } from "../utils/asyncHandler.js";

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

	router.post(
		"/login",
		asyncHandler(async (req, res) => {
			const { username, password } = req.body || {};
			const user = usersRepo.findByUsername(username);
			if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
				console.log(`Login failed: username="${username}" — invalid credentials`);
				return res.status(401).json({ error: "Invalid username or password" });
			}

			const totp = totpRepo.get(user.id);
			if (totp?.enabled) {
				const pendingToken = signTwoFactorChallenge({ id: user.id }, jwtSecret);
				console.log(`Login: user "${username}" (id ${user.id}) passed password check, awaiting 2FA code`);
				return res.json({ requiresTwoFactor: true, pendingToken });
			}

			setSessionCookie(req, res, user);
			console.log(`Login success: user "${username}" (id ${user.id})`);
			res.json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
		})
	);

	router.post("/login/2fa", (req, res) => {
		const { pendingToken, code } = req.body || {};
		let payload;
		try {
			payload = verifyTwoFactorChallenge(pendingToken, jwtSecret);
		} catch {
			console.log("Login 2FA failed: expired or invalid challenge token");
			return res.status(401).json({ error: "Two-factor challenge expired or invalid — log in again" });
		}
		const user = usersRepo.findById(payload.id);
		const totp = totpRepo.get(user?.id);
		if (!user || !totp?.enabled || !verifyTotpCode(code, totp.secret)) {
			console.log(`Login 2FA failed: user id ${payload.id} — invalid code`);
			return res.status(401).json({ error: "Invalid code" });
		}

		setSessionCookie(req, res, user);
		console.log(`Login success (2FA): user "${user.username}" (id ${user.id})`);
		res.json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
	});

	router.post("/logout", (req, res) => {
		res.clearCookie("session");
		res.status(204).end();
	});

	router.get("/me", (req, res) => {
		const token = req.cookies?.session;
		if (!token) return res.status(401).json({ error: "Not authenticated" });
		let payload;
		try {
			payload = verifySession(token, jwtSecret);
		} catch {
			return res.status(401).json({ error: "Invalid session" });
		}
		const user = usersRepo.findById(payload.id);
		if (!user) return res.status(401).json({ error: "Not authenticated" });
		res.json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
	});

	return router;
}
