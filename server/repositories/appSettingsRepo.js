export function createAppSettingsRepo(db) {
	return {
		get(key, fallback = null) {
			const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
			return row ? row.value : fallback;
		},
		set(key, value) {
			db.prepare(
				`INSERT INTO app_settings (key, value) VALUES (?, ?)
				 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
			).run(key, value);
		},
	};
}
