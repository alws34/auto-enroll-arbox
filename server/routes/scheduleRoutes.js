import express from "express";
import { computeFireAt } from "../scheduling/fireAt.js";

export function createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, maxClassesPerMonth }) {
	const router = express.Router();

	router.get("/", async (req, res) => {
		const creds = credentialsRepo.get(req.user.id);
		if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

		const days = Number(req.query.days || 7);
		const from = new Date();
		from.setUTCHours(0, 0, 0, 0);
		const to = new Date(from);
		to.setUTCDate(to.getUTCDate() + days);

		const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
		const [rawClasses, quota] = await Promise.all([
			arboxClient.getScheduleBetweenDates(token, refreshToken, from.toISOString(), to.toISOString()),
			arboxClient.getQuota(token, refreshToken),
		]);

		const scheduleIds = rawClasses.map((c) => c.id);
		const jobsByScheduleId = jobsRepo.findActiveByUserAndScheduleIds(req.user.id, scheduleIds);

		const classes = rawClasses.map((c) => {
			const fireAt = computeFireAt(c.date, c.time, c.enable_registration_time).toISOString();
			const job = jobsByScheduleId.get(c.id);
			return {
				id: c.id,
				date: c.date,
				time: c.time,
				name: c.box_categories?.name?.trim(),
				coach: c.coach?.full_name,
				maxUsers: c.max_users,
				bookedCount: (c.booked_users || []).length,
				enableRegistrationTime: c.enable_registration_time,
				fireAt,
				alreadyScheduled: !!job,
				jobStatus: job?.status || null,
				jobId: job?.id || null,
			};
		});

		res.json({ classes, quota: { used: quota.used, limit: maxClassesPerMonth } });
	});

	return router;
}
