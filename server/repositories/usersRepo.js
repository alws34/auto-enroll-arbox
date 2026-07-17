export function createUsersRepo(db) {
	return {
		count() {
			return db.prepare("SELECT COUNT(*) as n FROM users").get().n;
		},
		create({ username, passwordHash, isAdmin }) {
			const info = db
				.prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)")
				.run(username, passwordHash, isAdmin ? 1 : 0);
			return this.findById(info.lastInsertRowid);
		},
		findByUsername(username) {
			return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
		},
		findById(id) {
			return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
		},
		list() {
			return db.prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY id").all();
		},
	};
}
