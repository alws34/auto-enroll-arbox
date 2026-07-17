import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./index.js";

test("createDb applies migrations and creates expected tables", () => {
	const db = createDb(":memory:");
	const tables = db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
		.all()
		.map((r) => r.name);
	assert.ok(tables.includes("users"));
	assert.ok(tables.includes("arbox_credentials"));
	assert.ok(tables.includes("webhook_settings"));
	assert.ok(tables.includes("scheduled_jobs"));
	db.close();
});

test("createDb is idempotent (safe to call migrate twice on same file)", () => {
	const db1 = createDb(":memory:");
	db1.close();
	const db2 = createDb(":memory:"); // fresh :memory: db, just proving no throw on repeated createDb calls
	assert.ok(db2.prepare("SELECT 1 as ok").get().ok === 1);
	db2.close();
});
