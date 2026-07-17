import { encrypt, decrypt } from "../crypto/encryption.js";

export function createCredentialsRepo(db, encryptionKey) {
	return {
		get(userId) {
			const row = db.prepare("SELECT * FROM arbox_credentials WHERE user_id = ?").get(userId);
			if (!row) return undefined;
			return { email: row.email, password: decrypt(row.password_encrypted, encryptionKey) };
		},
		set(userId, { email, password }) {
			const passwordEncrypted = encrypt(password, encryptionKey);
			db.prepare(
				`INSERT INTO arbox_credentials (user_id, email, password_encrypted, updated_at)
				 VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
				 ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, password_encrypted = excluded.password_encrypted, updated_at = excluded.updated_at`
			).run(userId, email, passwordEncrypted);
		},
	};
}
