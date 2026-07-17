import express from "express";
import { generateTotpSecret, totpKeyUri, totpQrCodeDataUrl, verifyTotpCode } from "../auth/totp.js";

export function createTwoFactorRoutes({ usersRepo, totpRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		const existing = totpRepo.get(req.user.id);
		res.json({ enabled: !!existing?.enabled });
	});

	router.post("/setup", async (req, res) => {
		const user = usersRepo.findById(req.user.id);
		const secret = generateTotpSecret();
		totpRepo.setPendingSecret(req.user.id, secret);
		const otpauthUrl = totpKeyUri(user.username, secret);
		const qrCodeDataUrl = await totpQrCodeDataUrl(otpauthUrl);
		res.json({ secret, otpauthUrl, qrCodeDataUrl });
	});

	router.post("/confirm", (req, res) => {
		const { code } = req.body || {};
		const pending = totpRepo.get(req.user.id);
		if (!pending) return res.status(400).json({ error: "Start setup first" });
		if (!verifyTotpCode(code, pending.secret)) return res.status(400).json({ error: "Invalid code" });
		totpRepo.enable(req.user.id);
		res.json({ enabled: true });
	});

	router.post("/disable", (req, res) => {
		const { code } = req.body || {};
		const current = totpRepo.get(req.user.id);
		if (!current?.enabled) return res.status(400).json({ error: "Two-factor is not enabled" });
		if (!verifyTotpCode(code, current.secret)) return res.status(400).json({ error: "Invalid code" });
		totpRepo.disable(req.user.id);
		res.json({ enabled: false });
	});

	return router;
}
