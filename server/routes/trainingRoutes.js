import express from "express";
import { computeRegistrationStatus } from "../scheduling/classStatus.js";
import { computeMuscleCoverage } from "../training/coverage.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// This is a forward-looking planner, not an attendance log: it only looks at
// classes you're actually booked/waitlisted into (same rule scheduleRoutes
// uses for "My schedule"), so you can see at a glance whether you've booked
// anything for legs this week before the good slots fill up — not a report
// of what you've already done.
export function createTrainingRoutes({ credentialsRepo, jobsRepo, arboxClient }) {
	const router = express.Router();

	router.get(
		"/coverage",
		asyncHandler(async (req, res) => {
			const creds = credentialsRepo.get(req.user.id);
			if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

			const days = Number(req.query.days || 7);
			const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : new Date();
			from.setUTCHours(0, 0, 0, 0);
			const to = new Date(from);
			to.setUTCDate(to.getUTCDate() + days);

			const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
			const rawClasses = await arboxClient.getScheduleBetweenDates(token, refreshToken, from.toISOString(), to.toISOString());

			const scheduleIds = rawClasses.map((c) => c.id);
			const jobsByScheduleId = jobsRepo.findActiveByUserAndScheduleIds(req.user.id, scheduleIds);

			const bookedClasses = rawClasses.filter((c) => {
				const job = jobsByScheduleId.get(c.id);
				return computeRegistrationStatus(c, job) !== "none";
			});

			// Fetch each booked class's WOD text (where one exists) so the coverage
			// computation can use the detailed movement parser instead of falling
			// straight back to the coarse category guess.
			const withWorkoutText = await Promise.all(
				bookedClasses.map(async (c) => {
					if (!c.workout_id) return { id: c.id, date: c.date, name: c.box_categories?.name?.trim(), workoutText: null };
					try {
						const sections = await arboxClient.getWorkoutLogbook(token, refreshToken, c.workout_id);
						const workoutText = sections.map((s) => s.text).join("\n") || null;
						return { id: c.id, date: c.date, name: c.box_categories?.name?.trim(), workoutText };
					} catch {
						// A single class's WOD fetch failing shouldn't take down the whole
						// week's coverage — just fall back to the category guess for it.
						return { id: c.id, date: c.date, name: c.box_categories?.name?.trim(), workoutText: null };
					}
				})
			);

			const { totals, breakdown } = computeMuscleCoverage(withWorkoutText);

			res.json({
				weekStart: from.toISOString().slice(0, 10),
				weekEnd: new Date(to.getTime() - 86400000).toISOString().slice(0, 10),
				totals,
				breakdown,
			});
		})
	);

	return router;
}
