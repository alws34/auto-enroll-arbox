import jwt from "jsonwebtoken";

const EXPIRES_IN = "30d";

export function signSession(user, secret) {
	return jwt.sign({ id: user.id, isAdmin: !!user.isAdmin }, secret, { expiresIn: EXPIRES_IN });
}

export function verifySession(token, secret) {
	return jwt.verify(token, secret);
}
