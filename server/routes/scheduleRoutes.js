import express from "express";
import { computeFireAt, classTimesToUtc } from "../scheduling/fireAt.js";

export function createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, usersRepo }) {
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
			const { startUtc, endUtc } = classTimesToUtc(c.date, c.time, c.end_time);
			const job = jobsByScheduleId.get(c.id);

			// Arbox is the source of truth for whether the user is actually booked/waitlisted —
			// a class registered from the official app (not through us) has no local job row at all.
			let registrationStatus = job?.status || "none";
			if (c.user_booked) registrationStatus = "success";
			else if (c.user_in_standby) registrationStatus = "waitlisted";

			return {
				id: c.id,
				date: c.date,
				time: c.time,
				endTime: c.end_time,
				name: c.box_categories?.name?.trim(),
				coach: c.coach?.full_name,
				maxUsers: c.max_users,
				bookedCount: (c.booked_users || []).length,
				enableRegistrationTime: c.enable_registration_time,
				fireAt,
				startUtc,
				endUtc,
				alreadyScheduled: registrationStatus !== "none",
				jobStatus: registrationStatus === "none" ? null : registrationStatus,
				jobId: job?.id || null,
			};
		});

		const user = usersRepo.findById(req.user.id);
		res.json({ classes, quota: { used: quota.used, limit: user.max_classes_per_month } });
	});

	router.delete("/:scheduleId", async (req, res) => {
		const scheduleId = Number(req.params.scheduleId);
		const creds = credentialsRepo.get(req.user.id);
		if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

		const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
		const membershipUserId = await arboxClient.getMembership(token, refreshToken);
		await arboxClient.cancel(token, refreshToken, { scheduleId, membershipUserId });

		const job = jobsRepo.findByUserAndScheduleId(req.user.id, scheduleId);
		if (job) jobsRepo.updateStatus(job.id, "cancelled", null);

		res.json({ ok: true });
	});

	return router;
}
