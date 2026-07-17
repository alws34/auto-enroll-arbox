import express from "express";

export function createQuotaRoutes({ usersRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		const user = usersRepo.findById(req.user.id);
		res.json({ maxClassesPerMonth: user.max_classes_per_month });
	});

	router.put("/", (req, res) => {
		const value = Number(req.body?.maxClassesPerMonth);
		if (!Number.isInteger(value) || value <= 0) {
			return res.status(400).json({ error: "maxClassesPerMonth must be a positive integer" });
		}
		usersRepo.updateMaxClassesPerMonth(req.user.id, value);
		res.json({ maxClassesPerMonth: value });
	});

	return router;
}
