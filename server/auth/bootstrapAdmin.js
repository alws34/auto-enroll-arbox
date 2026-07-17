import { hashPassword } from "../crypto/password.js";

export async function bootstrapAdmin({ usersRepo, username, password, maxClassesPerMonth }) {
	if (usersRepo.count() > 0) return;
	if (!username || !password) {
		throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set to bootstrap the first account");
	}
	usersRepo.create({ username, passwordHash: await hashPassword(password), isAdmin: true, maxClassesPerMonth });
}
