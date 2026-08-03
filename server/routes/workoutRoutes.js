import express from "express";
import { findMuscleGroups } from "../training/movementDictionary.js";
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

			// Best-effort muscle-group tag for this specific class, for the detail
			// modal's mini muscle map. Empty here just means the WOD text didn't
			// match any known movement — the client falls back to a coarser guess
			// from the class category in that case, same as the weekly coverage does.
			const { groups } = findMuscleGroups(sections.map((s) => s.text).join("\n"));

			res.json({ sections, muscleGroups: groups });
		})
	);

	return router;
}
