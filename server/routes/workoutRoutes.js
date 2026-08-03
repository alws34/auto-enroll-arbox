import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createWorkoutRoutes({ credentialsRepo, arboxClient }) {
	const router = express.Router();

	router.get(
		"/:workoutId",
		asyncHandler(async (req, res) => {
			const workoutId = Number(req.params.workoutId);
			if (!workoutId) return res.status(400).json({ error: "workoutId is required" });

			const creds = credentialsRepo.get(req.user.id);
			if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

			const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
			const sections = await arboxClient.getWorkoutLogbook(token, refreshToken, workoutId);
			res.json({ sections });
		})
	);

	return router;
}
