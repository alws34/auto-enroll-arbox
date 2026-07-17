import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(rawKey) {
	return crypto.createHash("sha256").update(String(rawKey)).digest();
}

export function encrypt(plaintext, rawKey) {
	const key = deriveKey(rawKey);
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(payload, rawKey) {
	const key = deriveKey(rawKey);
	const buf = Buffer.from(payload, "base64");
	const iv = buf.subarray(0, IV_LENGTH);
	const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
	const ciphertext = buf.subarray(IV_LENGTH + 16);
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
