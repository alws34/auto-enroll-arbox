import jwt from "jsonwebtoken";

const EXPIRES_IN = "30d";
const TWO_FACTOR_CHALLENGE_EXPIRES_IN = "5m";

export function signSession(user, secret) {
	return jwt.sign({ id: user.id, isAdmin: !!user.isAdmin }, secret, { expiresIn: EXPIRES_IN });
}

export function verifySession(token, secret) {
	return jwt.verify(token, secret);
}

export function signTwoFactorChallenge(user, secret) {
	return jwt.sign({ id: user.id, stage: "2fa" }, secret, { expiresIn: TWO_FACTOR_CHALLENGE_EXPIRES_IN });
}

export function verifyTwoFactorChallenge(token, secret) {
	const payload = jwt.verify(token, secret);
	if (payload.stage !== "2fa") throw new Error("Not a two-factor challenge token");
	return payload;
}
