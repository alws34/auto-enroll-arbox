import express from "express";
import { computeReminderAt } from "../scheduling/fireAt.js";

const MAX_REMINDERS_PER_CLASS = 2;

export function createRemindersRoutes({ remindersRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		const scheduleId = Number(req.query.scheduleId);
		if (!scheduleId) return res.status(400).json({ error: "scheduleId is required" });
		res.json(remindersRepo.listByUserAndSchedule(req.user.id, scheduleId).map(toApiReminder));
	});

	router.post("/", (req, res) => {
		const { scheduleId, classDate, classTime, className, minutesBefore } = req.body || {};
		if (!scheduleId || !classDate || !classTime || !className || !minutesBefore) {
			return res.status(400).json({ error: "scheduleId, classDate, classTime, className, minutesBefore are required" });
		}
		if (remindersRepo.countByUserAndSchedule(req.user.id, scheduleId) >= MAX_REMINDERS_PER_CLASS) {
			return res.status(400).json({ error: `You can only set up to ${MAX_REMINDERS_PER_CLASS} reminders per class` });
		}
		const remindAt = computeReminderAt(classDate, classTime, Number(minutesBefore)).toISOString();
		try {
			const reminder = remindersRepo.create({
				userId: req.user.id,
				scheduleId,
				classDate,
				classTime,
				className,
				minutesBefore: Number(minutesBefore),
				remindAt,
			});
			res.status(201).json(toApiReminder(reminder));
		} catch (err) {
			res.status(409).json({ error: "A reminder with that offset already exists for this class" });
		}
	});

	router.delete("/:id", (req, res) => {
		const reminder = remindersRepo.findById(Number(req.params.id), req.user.id);
		if (!reminder) return res.status(404).json({ error: "Reminder not found" });
		remindersRepo.delete(reminder.id);
		res.status(204).end();
	});

	return router;
}

function toApiReminder(r) {
	return {
		id: r.id,
		scheduleId: r.schedule_id,
		classDate: r.class_date,
		classTime: r.class_time,
		className: r.class_name,
		minutesBefore: r.minutes_before,
		remindAt: r.remind_at,
		sent: !!r.sent_at,
	};
}
