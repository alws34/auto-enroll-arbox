export function createWebhookRepo(db) {
	return {
		get(userId) {
			const row = db.prepare("SELECT webhook_url FROM webhook_settings WHERE user_id = ?").get(userId);
			return row ? row.webhook_url : null;
		},
		set(userId, webhookUrl) {
			db.prepare(
				`INSERT INTO webhook_settings (user_id, webhook_url) VALUES (?, ?)
				 ON CONFLICT(user_id) DO UPDATE SET webhook_url = excluded.webhook_url`
			).run(userId, webhookUrl);
		},
	};
}
