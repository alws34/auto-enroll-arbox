import express from "express";
import { computeFireAt } from "../scheduling/fireAt.js";
import { arboxErrorMessage, findMembershipForBooking } from "../arbox/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createJobsRoutes({ jobsRepo, credentialsRepo, arboxClient, scheduler }) {
	const router = express.Router();

	router.post(
		"/",
		asyncHandler(async (req, res) => {
			const { scheduleId, classDate } = req.body || {};
			const creds = credentialsRepo.get(req.user.id);
			if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

			const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
			const dayStart = `${classDate}T00:00:00.000Z`;
			const classes = await arboxClient.getScheduleBetweenDates(token, refreshToken, dayStart, dayStart);
			const targetClass = classes.find((c) => c.id === scheduleId);
			if (!targetClass) return res.status(404).json({ error: "Class not found for that date" });

			const fireAt = computeFireAt(targetClass.date, targetClass.time, targetClass.enable_registration_time).toISOString();
			const job = jobsRepo.create({
				userId: req.user.id,
				scheduleId: targetClass.id,
				classDate: targetClass.date,
				classTime: targetClass.time,
				className: targetClass.box_categories?.name?.trim() || "",
				enableRegistrationTime: targetClass.enable_registration_time,
				fireAt,
			});
			scheduler.arm(job);
			res.status(201).json(toApiJob(job));
		})
	);

	router.get("/", (req, res) => {
		res.json(jobsRepo.listByUser(req.user.id).map(toApiJob));
	});

	router.delete(
		"/:id",
		asyncHandler(async (req, res) => {
			const job = jobsRepo.findById(Number(req.params.id), req.user.id);
			if (!job) return res.status(404).json({ error: "Job not found" });

			if (job.status === "pending") {
				scheduler.cancelTimer(job.id);
				jobsRepo.updateStatus(job.id, "cancelled", null);
			} else if (job.status === "success" || job.status === "waitlisted") {
				const creds = credentialsRepo.get(req.user.id);
				const { token, refreshToken, arboxUserId } = await arboxClient.login(creds.email, creds.password);

				// Same reasoning as scheduleRoutes' cancel: must use the membership that
				// actually owns this booking, not just any active one on the account.
				const dayStart = `${job.class_date}T00:00:00.000Z`;
				const dayClasses = await arboxClient.getScheduleBetweenDates(token, refreshToken, dayStart, dayStart);
				const targetClass = dayClasses.find((c) => c.id === job.schedule_id);
				const membershipUserId = targetClass ? findMembershipForBooking(targetClass, arboxUserId) : null;
				if (!membershipUserId) {
					return res.status(400).json({ error: "Could not find your registration for this class" });
				}

				const result = await arboxClient.cancel(token, refreshToken, { scheduleId: job.schedule_id, membershipUserId });
				if (result.status !== 200) {
					return res.status(400).json({ error: arboxErrorMessage(result.body) });
				}
				jobsRepo.updateStatus(job.id, "cancelled", null);
			} else {
				return res.status(400).json({ error: `Cannot cancel a job in status "${job.status}"` });
			}

			res.json(toApiJob(jobsRepo.findById(job.id, req.user.id)));
		})
	);

	return router;
}

function toApiJob(job) {
	return {
		id: job.id,
		scheduleId: job.schedule_id,
		classDate: job.class_date,
		classTime: job.class_time,
		className: job.class_name,
		fireAt: job.fire_at,
		status: job.status,
		resultDetail: job.result_detail,
	};
}
