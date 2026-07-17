import { test } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt } from "./encryption.js";

const KEY = "test-encryption-key-not-for-prod";

test("encrypt/decrypt round-trips the original plaintext", () => {
	const plaintext = "s3cret-arbox-password!";
	const ciphertext = encrypt(plaintext, KEY);
	assert.notEqual(ciphertext, plaintext);
	assert.equal(decrypt(ciphertext, KEY), plaintext);
});

test("encrypting the same plaintext twice yields different ciphertext (random IV)", () => {
	const a = encrypt("same-input", KEY);
	const b = encrypt("same-input", KEY);
	assert.notEqual(a, b);
	assert.equal(decrypt(a, KEY), "same-input");
	assert.equal(decrypt(b, KEY), "same-input");
});

test("decrypt throws with the wrong key", () => {
	const ciphertext = encrypt("hello", KEY);
	assert.throws(() => decrypt(ciphertext, "a-completely-different-key"));
});
