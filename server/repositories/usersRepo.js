const DEFAULT_MAX_CLASSES_PER_MONTH = 12;

export function createUsersRepo(db) {
	return {
		count() {
			return db.prepare("SELECT COUNT(*) as n FROM users").get().n;
		},
		create({ username, passwordHash, isAdmin, maxClassesPerMonth = DEFAULT_MAX_CLASSES_PER_MONTH }) {
			const info = db
				.prepare("INSERT INTO users (username, password_hash, is_admin, max_classes_per_month) VALUES (?, ?, ?, ?)")
				.run(username, passwordHash, isAdmin ? 1 : 0, maxClassesPerMonth);
			return this.findById(info.lastInsertRowid);
		},
		findByUsername(username) {
			return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
		},
		findById(id) {
			return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
		},
		list() {
			return db.prepare("SELECT id, username, is_admin, max_classes_per_month, created_at FROM users ORDER BY id").all();
		},
		updateMaxClassesPerMonth(id, maxClassesPerMonth) {
			db.prepare("UPDATE users SET max_classes_per_month = ? WHERE id = ?").run(maxClassesPerMonth, id);
		},
	};
}
