import { authenticator } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Arbox Auto-Enroll";

export function generateTotpSecret() {
	return authenticator.generateSecret();
}

export function totpKeyUri(username, secret) {
	return authenticator.keyuri(username, ISSUER, secret);
}

export function totpQrCodeDataUrl(otpauthUrl) {
	return QRCode.toDataURL(otpauthUrl);
}

export function verifyTotpCode(code, secret) {
	try {
		return authenticator.verify({ token: String(code), secret });
	} catch {
		return false;
	}
}

export function generateTotpCode(secret) {
	return authenticator.generate(secret);
}
