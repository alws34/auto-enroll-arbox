const DEFAULT_MAX_CLASSES_PER_MONTH = 12;

export function createUsersRepo(db) {
	return {
		count() {
			return db.prepare("SELECT COUNT(*) as n FROM users").get().n;
		},
		create({
			username,
			passwordHash,
			isAdmin,
			maxClassesPerMonth = DEFAULT_MAX_CLASSES_PER_MONTH,
			email = null,
			emailNotificationsEnabled = true,
		}) {
			const info = db
				.prepare(
					`INSERT INTO users (username, password_hash, is_admin, max_classes_per_month, email, email_notifications_enabled)
					 VALUES (?, ?, ?, ?, ?, ?)`
				)
				.run(username, passwordHash, isAdmin ? 1 : 0, maxClassesPerMonth, email, emailNotificationsEnabled ? 1 : 0);
			return this.findById(info.lastInsertRowid);
		},
		findByUsername(username) {
			return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
		},
		findById(id) {
			return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
		},
		list() {
			return db
				.prepare(
					"SELECT id, username, is_admin, max_classes_per_month, email, email_notifications_enabled, created_at FROM users ORDER BY id"
				)
				.all();
		},
		updateMaxClassesPerMonth(id, maxClassesPerMonth) {
			db.prepare("UPDATE users SET max_classes_per_month = ? WHERE id = ?").run(maxClassesPerMonth, id);
		},
		updateNotificationPrefs(id, { email, emailNotificationsEnabled }) {
			db.prepare("UPDATE users SET email = ?, email_notifications_enabled = ? WHERE id = ?").run(
				email,
				emailNotificationsEnabled ? 1 : 0,
				id
			);
		},
		updatePasswordHash(id, passwordHash) {
			db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
		},
	};
}
