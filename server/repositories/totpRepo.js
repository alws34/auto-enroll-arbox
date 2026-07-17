import { encrypt, decrypt } from "../crypto/encryption.js";

export function createTotpRepo(db, encryptionKey) {
	return {
		get(userId) {
			const row = db.prepare("SELECT totp_secret, totp_enabled FROM users WHERE id = ?").get(userId);
			if (!row?.totp_secret) return null;
			return { secret: decrypt(row.totp_secret, encryptionKey), enabled: !!row.totp_enabled };
		},
		setPendingSecret(userId, secret) {
			db.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?").run(encrypt(secret, encryptionKey), userId);
		},
		enable(userId) {
			db.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(userId);
		},
		disable(userId) {
			db.prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?").run(userId);
		},
	};
}
