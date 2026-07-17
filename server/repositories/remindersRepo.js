export function createRemindersRepo(db) {
	return {
		countByUserAndSchedule(userId, scheduleId) {
			return db
				.prepare("SELECT COUNT(*) as n FROM class_reminders WHERE user_id = ? AND schedule_id = ?")
				.get(userId, scheduleId).n;
		},
		create({ userId, scheduleId, classDate, classTime, className, minutesBefore, remindAt }) {
			const info = db
				.prepare(
					`INSERT INTO class_reminders
					 (user_id, schedule_id, class_date, class_time, class_name, minutes_before, remind_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
				.run(userId, scheduleId, classDate, classTime, className, minutesBefore, remindAt);
			return db.prepare("SELECT * FROM class_reminders WHERE id = ?").get(info.lastInsertRowid);
		},
		listByUserAndSchedule(userId, scheduleId) {
			return db
				.prepare("SELECT * FROM class_reminders WHERE user_id = ? AND schedule_id = ? ORDER BY minutes_before")
				.all(userId, scheduleId);
		},
		findById(id, userId) {
			return db.prepare("SELECT * FROM class_reminders WHERE id = ? AND user_id = ?").get(id, userId);
		},
		delete(id) {
			db.prepare("DELETE FROM class_reminders WHERE id = ?").run(id);
		},
		listDue() {
			return db
				.prepare("SELECT * FROM class_reminders WHERE sent_at IS NULL AND remind_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')")
				.all();
		},
		markSent(id) {
			db.prepare("UPDATE class_reminders SET sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(id);
		},
	};
}
