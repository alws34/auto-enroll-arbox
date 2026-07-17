import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export function createDb(dbPath) {
	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	migrate(db);
	return db;
}

function migrate(db) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS _migrations (
			filename TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)
	`);
	const applied = new Set(
		db.prepare("SELECT filename FROM _migrations").all().map((r) => r.filename)
	);
	const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
	for (const file of files) {
		if (applied.has(file)) continue;
		const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
		const runMigration = db.transaction(() => {
			db.exec(sql);
			db.prepare("INSERT INTO _migrations (filename) VALUES (?)").run(file);
		});
		runMigration();
	}
}
