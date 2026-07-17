export function createJobsRepo(db) {
	return {
		create({ userId, scheduleId, classDate, classTime, className, enableRegistrationTime, fireAt }) {
			const info = db
				.prepare(
					`INSERT INTO scheduled_jobs
					 (user_id, schedule_id, class_date, class_time, class_name, enable_registration_time, fire_at, status)
					 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
				)
				.run(userId, scheduleId, classDate, classTime, className, enableRegistrationTime, fireAt);
			return this.findByIdUnscoped(info.lastInsertRowid);
		},
		findByIdUnscoped(id) {
			return db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id);
		},
		findById(id, userId) {
			return db.prepare("SELECT * FROM scheduled_jobs WHERE id = ? AND user_id = ?").get(id, userId);
		},
		listByUser(userId) {
			return db
				.prepare("SELECT * FROM scheduled_jobs WHERE user_id = ? ORDER BY fire_at DESC")
				.all(userId);
		},
		listPending() {
			return db.prepare("SELECT * FROM scheduled_jobs WHERE status = 'pending'").all();
		},
		findActiveByUserAndScheduleIds(userId, scheduleIds) {
			if (scheduleIds.length === 0) return new Map();
			const placeholders = scheduleIds.map(() => "?").join(",");
			const rows = db
				.prepare(
					`SELECT * FROM scheduled_jobs
					 WHERE user_id = ? AND schedule_id IN (${placeholders})
					 AND status IN ('pending', 'fired', 'success', 'waitlisted')`
				)
				.all(userId, ...scheduleIds);
			return new Map(rows.map((r) => [r.schedule_id, r]));
		},
		updateStatus(id, status, resultDetail) {
			db.prepare(
				`UPDATE scheduled_jobs SET status = ?, result_detail = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
			).run(status, resultDetail, id);
		},
	};
}
