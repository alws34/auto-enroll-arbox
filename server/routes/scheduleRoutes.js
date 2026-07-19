import express from "express";
import { computeFireAt, classTimesToUtc } from "../scheduling/fireAt.js";
import { arboxErrorMessage, findMembershipForBooking } from "../arbox/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, usersRepo }) {
	const router = express.Router();

	router.get(
		"/",
		asyncHandler(async (req, res) => {
			const creds = credentialsRepo.get(req.user.id);
			if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

			const days = Number(req.query.days || 7);
			const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : new Date();
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
		})
	);

	router.delete(
		"/:scheduleId",
		asyncHandler(async (req, res) => {
			const scheduleId = Number(req.params.scheduleId);
			const classDate = req.query.classDate;
			if (!classDate) return res.status(400).json({ error: "classDate query param is required" });

			const creds = credentialsRepo.get(req.user.id);
			if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

			const { token, refreshToken, arboxUserId } = await arboxClient.login(creds.email, creds.password);

			// Cancelling requires the membership_user_id that actually owns THIS booking —
			// a user can have more than one active membership, and "pick any active one"
			// (fine when creating a new booking) silently no-ops against the wrong one here.
			const dayStart = `${classDate}T00:00:00.000Z`;
			const dayClasses = await arboxClient.getScheduleBetweenDates(token, refreshToken, dayStart, dayStart);
			const targetClass = dayClasses.find((c) => c.id === scheduleId);
			const membershipUserId = targetClass ? findMembershipForBooking(targetClass, arboxUserId) : null;
			if (!membershipUserId) {
				return res.status(400).json({ error: "Could not find your registration for this class" });
			}

			const result = await arboxClient.cancel(token, refreshToken, { scheduleId, membershipUserId });
			if (result.status !== 200) {
				return res.status(400).json({ error: arboxErrorMessage(result.body) });
			}

			const job = jobsRepo.findByUserAndScheduleId(req.user.id, scheduleId);
			if (job) jobsRepo.updateStatus(job.id, "cancelled", null);

			res.json({ ok: true });
		})
	);

	return router;
}
