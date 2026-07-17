import { verifySession } from "./jwt.js";

export function requireAuth({ jwtSecret }) {
	return (req, res, next) => {
		const token = req.cookies?.session;
		if (!token) return res.status(401).json({ error: "Not authenticated" });
		try {
			req.user = verifySession(token, jwtSecret);
			next();
		} catch {
			res.status(401).json({ error: "Invalid session" });
		}
	};
}

export function requireAdmin(req, res, next) {
	if (!req.user?.isAdmin) return res.status(403).json({ error: "Admin only" });
	next();
}
