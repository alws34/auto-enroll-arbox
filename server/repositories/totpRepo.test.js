import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "./usersRepo.js";
import { createTotpRepo } from "./totpRepo.js";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const totpRepo = createTotpRepo(db, "test-key");
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	return { db, user, totpRepo };
}

test("get returns null when no secret has been set", () => {
	const { user, totpRepo } = setup();
	assert.equal(totpRepo.get(user.id), null);
});

test("setPendingSecret stores encrypted, starts disabled; enable flips it on", () => {
	const { user, totpRepo } = setup();
	totpRepo.setPendingSecret(user.id, "JBSWY3DPEHPK3PXP");
	const pending = totpRepo.get(user.id);
	assert.equal(pending.secret, "JBSWY3DPEHPK3PXP");
	assert.equal(pending.enabled, false);

	totpRepo.enable(user.id);
	const enabled = totpRepo.get(user.id);
	assert.equal(enabled.secret, "JBSWY3DPEHPK3PXP");
	assert.equal(enabled.enabled, true);
});

test("disable clears the secret entirely", () => {
	const { user, totpRepo } = setup();
	totpRepo.setPendingSecret(user.id, "JBSWY3DPEHPK3PXP");
	totpRepo.enable(user.id);
	totpRepo.disable(user.id);
	assert.equal(totpRepo.get(user.id), null);
});
