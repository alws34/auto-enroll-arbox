import { test } from "node:test";
import assert from "node:assert/strict";
import {
	generateTotpSecret,
	totpKeyUri,
	totpQrCodeDataUrl,
	verifyTotpCode,
	generateTotpCode,
} from "./totp.js";

test("generateTotpSecret returns a non-empty base32 string", () => {
	const secret = generateTotpSecret();
	assert.ok(secret.length > 0);
	assert.match(secret, /^[A-Z2-7]+$/);
});

test("a code generated for a secret verifies against that same secret", () => {
	const secret = generateTotpSecret();
	const code = generateTotpCode(secret);
	assert.equal(verifyTotpCode(code, secret), true);
});

test("an arbitrary wrong code fails verification", () => {
	const secret = generateTotpSecret();
	const wrongCode = generateTotpCode(secret) === "000000" ? "111111" : "000000";
	assert.equal(verifyTotpCode(wrongCode, secret), false);
});

test("verifyTotpCode returns false (not throws) for garbage input", () => {
	assert.equal(verifyTotpCode("not-a-code", "not-a-secret"), false);
});

test("totpKeyUri returns an otpauth:// URI", () => {
	const uri = totpKeyUri("alon", "ABCDEFGHIJKLMNOP");
	assert.match(uri, /^otpauth:\/\/totp\//);
	assert.match(uri, /alon/);
});

test("totpQrCodeDataUrl returns a PNG data URL", async () => {
	const uri = totpKeyUri("alon", "ABCDEFGHIJKLMNOP");
	const dataUrl = await totpQrCodeDataUrl(uri);
	assert.match(dataUrl, /^data:image\/png;base64,/);
});
