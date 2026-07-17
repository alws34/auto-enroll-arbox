const DEFAULT_POLL_INTERVAL_MS = 60 * 1000;

export function createReminderEngine({ remindersRepo, notify, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS }) {
	let timer = null;

	async function tick() {
		for (const reminder of remindersRepo.listDue()) {
			const delivered = await notify(reminder.user_id, "reminder", {
				classId: reminder.schedule_id,
				className: reminder.class_name,
				date: reminder.class_date,
				time: reminder.class_time,
				minutesBefore: reminder.minutes_before,
			});
			if (delivered) remindersRepo.markSent(reminder.id);
		}
	}

	function start() {
		if (timer) return;
		timer = setInterval(tick, pollIntervalMs);
		if (typeof timer.unref === "function") timer.unref();
	}

	function stop() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	return { start, stop, tick };
}
