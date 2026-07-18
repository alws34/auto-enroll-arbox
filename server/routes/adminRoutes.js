import express from "express";
import crypto from "node:crypto";
import { hashPassword } from "../crypto/password.js";
import { sendPasswordResetEmail, sendInviteEmail } from "../notifications/sendEmail.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createAdminRoutes({
	usersRepo,
	defaultMaxClassesPerMonth,
	passwordResetRepo,
	transporter,
	fromEmailProvider,
	appBaseUrl,
}) {
	const router = express.Router();

	router.get("/", (req, res) => {
		res.json(usersRepo.list());
	});

	router.post(
		"/",
		asyncHandler(async (req, res) => {
			const { username, isAdmin, maxClassesPerMonth, email } = req.body || {};
			if (!username || !email) return res.status(400).json({ error: "username and email are required" });
			if (!transporter) return res.status(503).json({ error: "Email is not configured on this server — can't send an invite" });
			if (usersRepo.findByUsername(username)) return res.status(409).json({ error: "Username already exists" });

			// No usable password until the invite is completed — placeholder is a random
			// bcrypt hash that can never match anything a real login attempt would send.
			const placeholderHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
			const user = usersRepo.create({
				username,
				passwordHash: placeholderHash,
				isAdmin: !!isAdmin,
				maxClassesPerMonth: maxClassesPerMonth ? Number(maxClassesPerMonth) : defaultMaxClassesPerMonth,
				email,
			});

			const { token } = passwordResetRepo.create(user.id, INVITE_TTL_MS);
			const inviteLink = `${appBaseUrl}/reset-password?token=${token}`;
			await sendInviteEmail({ transporter, fromAddress: fromEmailProvider(), toEmail: email, inviteLink });

			res.status(201).json({
				id: user.id,
				username: user.username,
				isAdmin: !!user.is_admin,
				maxClassesPerMonth: user.max_classes_per_month,
				email: user.email,
				invited: true,
			});
		})
	);

	router.post(
		"/:id/send-reset",
		asyncHandler(async (req, res) => {
			const user = usersRepo.findById(Number(req.params.id));
			if (!user) return res.status(404).json({ error: "User not found" });
			if (!user.email) return res.status(400).json({ error: "User has no notification email configured" });
			if (!transporter) return res.status(503).json({ error: "Email is not configured on this server" });

			const { token } = passwordResetRepo.create(user.id);
			const resetLink = `${appBaseUrl}/reset-password?token=${token}`;
			await sendPasswordResetEmail({ transporter, fromAddress: fromEmailProvider(), toEmail: user.email, resetLink });
			res.json({ sent: true });
		})
	);

	return router;
}
