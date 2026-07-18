import express from "express";
import { hashPassword } from "../crypto/password.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createPasswordResetRoutes({ passwordResetRepo, usersRepo }) {
	const router = express.Router();

	router.post(
		"/:token",
		asyncHandler(async (req, res) => {
			const { password } = req.body || {};
			if (!password || password.length < 8) {
				return res.status(400).json({ error: "Password must be at least 8 characters" });
			}
			const reset = passwordResetRepo.findValidByToken(req.params.token);
			if (!reset) return res.status(400).json({ error: "Reset link is invalid or has expired" });

			usersRepo.updatePasswordHash(reset.user_id, await hashPassword(password));
			passwordResetRepo.markUsed(reset.id);
			res.json({ ok: true });
		})
	);

	return router;
}
