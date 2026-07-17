import express from "express";
import { hashPassword } from "../crypto/password.js";
import { sendPasswordResetEmail } from "../notifications/sendEmail.js";

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

	router.post("/", async (req, res) => {
		const { username, password, isAdmin, maxClassesPerMonth, email } = req.body || {};
		if (!username || !password) return res.status(400).json({ error: "username and password are required" });
		if (usersRepo.findByUsername(username)) return res.status(409).json({ error: "Username already exists" });
		const user = usersRepo.create({
			username,
			passwordHash: await hashPassword(password),
			isAdmin: !!isAdmin,
			maxClassesPerMonth: maxClassesPerMonth ? Number(maxClassesPerMonth) : defaultMaxClassesPerMonth,
			email: email || null,
		});
		res.status(201).json({
			id: user.id,
			username: user.username,
			isAdmin: !!user.is_admin,
			maxClassesPerMonth: user.max_classes_per_month,
			email: user.email,
		});
	});

	router.post("/:id/send-reset", async (req, res) => {
		const user = usersRepo.findById(Number(req.params.id));
		if (!user) return res.status(404).json({ error: "User not found" });
		if (!user.email) return res.status(400).json({ error: "User has no notification email configured" });
		if (!transporter) return res.status(503).json({ error: "Email is not configured on this server" });

		const { token } = passwordResetRepo.create(user.id);
		const resetLink = `${appBaseUrl}/reset-password?token=${token}`;
		await sendPasswordResetEmail({ transporter, fromAddress: fromEmailProvider(), toEmail: user.email, resetLink });
		res.json({ sent: true });
	});

	return router;
}
