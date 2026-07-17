import crypto from "node:crypto";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function createPasswordResetRepo(db) {
	return {
		create(userId, ttlMs = TOKEN_TTL_MS) {
			const token = crypto.randomBytes(32).toString("hex");
			const expiresAt = new Date(Date.now() + ttlMs).toISOString();
			db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(
				userId,
				token,
				expiresAt
			);
			return { token, expiresAt };
		},
		findValidByToken(token) {
			return db
				.prepare(
					`SELECT * FROM password_reset_tokens
					 WHERE token = ? AND used_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`
				)
				.get(token);
		},
		markUsed(id) {
			db.prepare(`UPDATE password_reset_tokens SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(id);
		},
	};
}
