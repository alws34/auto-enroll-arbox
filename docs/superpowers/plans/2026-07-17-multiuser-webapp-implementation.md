# Multi-user Arbox Auto-Enroll Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-user cron/file-based Arbox auto-enroll script with a Dockerized, multi-user web app: SQLite persistence, per-user encrypted gym credentials, a precise exact-moment scheduling engine driven by Arbox's live `enable_registration_time` field, and per-user webhook notifications.

**Architecture:** Node/Express (ESM) backend serving a JSON API plus the built React/Vite static frontend from one process. SQLite (`better-sqlite3`) for all persistence. A dependency-injected `JobScheduler` holds precise per-class timers, durable across restarts. Single Docker container, deployed behind a reverse proxy.

**Tech Stack:** Node 18, Express, better-sqlite3, jsonwebtoken, bcryptjs, cookie-parser, date-fns / date-fns-tz, node-fetch, React 18, Vite, react-router-dom. Tests via Node's built-in `node:test` + `node:assert/strict`, plus `supertest` for route tests.

---

## Spec reference

Full design: `docs/superpowers/specs/2026-07-17-multiuser-webapp-design.md`. Key facts validated live against the real Arbox API in the prior session (do not re-derive these — they are confirmed):

- Every Arbox request needs header `whitelabel: hypr-training`.
- `box_id = 59`, `locations_box_id = 48`.
- `POST https://apiappv2.arboxapp.com/api/v2/user/login` — body `{email, password}` — returns `{data: {token, refreshToken, full_name, ...}}`.
- `GET https://apiappv2.arboxapp.com/api/v2/boxes/{BOX_ID}/memberships/1` — returns `{data: [{id, active, membership_types: {...}}, ...]}` — pick the first `active === 1` entry; its `id` is `membership_user_id`.
- `POST https://apiappv2.arboxapp.com/api/v2/schedule/betweenDates` — body `{from, to, locations_box_id, boxes_id}` (ISO date strings) — returns `{data: [classObj, ...]}`. Each `classObj` has `id`, `date` (`YYYY-MM-DD`), `time` (`HH:mm`), `box_categories.name`, `coach.full_name`, `max_users`, `booked_users` (array), `user_booked` (schedule_user id or null), `user_in_standby`, `enable_registration_time` (integer hours, 48 or 72).
- `POST https://apiappv2.arboxapp.com/api/v2/scheduleUser/insert` — body `{extras: null, membership_user_id, schedule_id}` — on success, status 200, body `{data: {..., user_booked: <id>, user_in_standby: null, ...}}` (same shape as a schedule row). On a business-rule rejection (e.g. category frequency limit), status `514`, body `{error: {message: "Schedule Exception List", messageToUser: [{message: "..."}], code: 514}}`.
- `POST https://apiappv2.arboxapp.com/api/v2/scheduleUser/cancel` is NOT the cancel endpoint — cancellation is `POST https://apiappv2.arboxapp.com/api/v2/scheduleUser/delete` — body `{schedule_id, membership_user_id}` — status 200 on success.
- `GET https://apiappv2.arboxapp.com/api/v2/user/feed` — returns `{scheduleUserStatus: {results: {past, future}}}` — used for the "sessions used this month" quota display (the monthly cap itself isn't cleanly exposed by Arbox for plan-type memberships, so it comes from a `MAX_CLASSES_PER_MONTH` env var, same as the old app's `config.maxClassesPerMonth`).

## File structure

```
server/
  index.js                        - Express app entry: wiring, static serving, listen
  db/
    index.js                      - better-sqlite3 connection + migration runner
    migrations/
      001_init.sql
  crypto/
    encryption.js                 - AES-256-GCM encrypt/decrypt (Arbox password)
    password.js                   - bcrypt hash/verify (app login password)
  arbox/
    constants.js                  - WHITELABEL / BOX_ID / LOCATIONS_BOX_ID / TIMEZONE
    client.js                     - ArboxClient: login, getMembership, getScheduleBetweenDates, enroll, cancel, getQuota
  scheduling/
    fireAt.js                     - computeFireAt(date, time, hours) pure function
    classifyEnrollResponse.js     - classify Arbox insert response as success/waitlisted/transient/terminal
    engine.js                     - JobScheduler class: boot/arm/cancelTimer/fireJob
  repositories/
    usersRepo.js
    credentialsRepo.js
    webhookRepo.js
    jobsRepo.js
  auth/
    bootstrapAdmin.js             - create admin user from env if users table empty
    jwt.js                        - sign/verify session JWT
    middleware.js                 - requireAuth, requireAdmin
  routes/
    authRoutes.js                 - POST /api/login, /api/logout, GET /api/me
    credentialsRoutes.js          - GET/PUT /api/me/arbox-credentials
    webhookRoutes.js              - GET/PUT /api/me/webhook
    scheduleRoutes.js             - GET /api/schedule
    jobsRoutes.js                 - POST/DELETE/GET /api/jobs
    adminRoutes.js                - GET/POST /api/admin/users
  notifications/
    sendWebhook.js                - POST job outcome to user's webhook_url

client/
  index.html
  vite.config.js
  package.json
  src/
    main.jsx
    App.jsx
    api.js                        - fetch wrapper (credentials: 'include')
    pages/
      LoginPage.jsx
      SchedulePage.jsx
      SettingsPage.jsx
      AdminUsersPage.jsx
    components/
      DayTabs.jsx
      ClassRow.jsx
      QuotaStrip.jsx
    styles.css

Dockerfile
docker-compose.yml
sample.env                        - updated with new vars
```

Removed (superseded by the above): `app.js`, `lib/arbox.js`, `lib/push-notification.js`, `data/config.js`, `data/schedule.js.sample`.

---

### Task 1: Prune legacy dependencies, add new ones

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit `package.json`**

Remove unused/superseded dependencies: `mongodb`, `mongoose`, `mongoose-unique-validator`, `@aws-sdk/client-s3`, `cors` (never actually imported — CORS headers were set manually), `express-validator` (unused), `croner` (replaced by the custom precision timer in `scheduling/engine.js`). Remove the `firebase-tools` devDependency and the `deploy` script (no longer deploying to Firebase). Add `better-sqlite3`, `date-fns-tz`, `cookie-parser` as dependencies, and `supertest` as a devDependency. Update `test` script to use Node's built-in test runner.

```json
{
	"name": "auto-enroll-arbox",
	"version": "2.0.0",
	"description": "",
	"main": "server/index.js",
	"type": "module",
	"engines": {
		"node": "18"
	},
	"scripts": {
		"test": "node --test server",
		"start": "node server/index.js",
		"dev": "nodemon server/index.js"
	},
	"author": "",
	"license": "ISC",
	"dependencies": {
		"better-sqlite3": "^9.4.3",
		"bcryptjs": "^2.4.3",
		"cookie-parser": "^1.4.6",
		"date-fns": "^2.30.0",
		"date-fns-tz": "^2.0.1",
		"dotenv": "^10.0.0",
		"express": "^4.17.1",
		"jsonwebtoken": "^8.5.1",
		"node-fetch": "^3.3.1"
	},
	"devDependencies": {
		"nodemon": "^2.0.13",
		"supertest": "^6.3.4"
	}
}
```

- [ ] **Step 2: Install**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && npm install`
Expected: installs cleanly, no `EBADENGINE` error (node 18 matches `engines`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: prune legacy deps, add sqlite/jwt/test stack for rewrite"
```

---

### Task 2: SQLite DB layer + migrations

**Files:**
- Create: `server/db/migrations/001_init.sql`
- Create: `server/db/index.js`
- Test: `server/db/index.test.js`

- [ ] **Step 1: Write the migration SQL**

`server/db/migrations/001_init.sql`:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE arbox_credentials (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE webhook_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  webhook_url TEXT
);

CREATE TABLE scheduled_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL,
  class_date TEXT NOT NULL,
  class_time TEXT NOT NULL,
  class_name TEXT NOT NULL,
  enable_registration_time INTEGER NOT NULL,
  fire_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_scheduled_jobs_status_fire_at ON scheduled_jobs(status, fire_at);
CREATE INDEX idx_scheduled_jobs_user ON scheduled_jobs(user_id);
```

- [ ] **Step 2: Write the DB module**

`server/db/index.js`:

```js
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
```

- [ ] **Step 3: Write the test**

`server/db/index.test.js`:

```js
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
```

- [ ] **Step 4: Run tests**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/db/index.test.js`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/db
git commit -m "feat: add sqlite db layer with migration runner"
```

---

### Task 3: Crypto helpers

**Files:**
- Create: `server/crypto/encryption.js`
- Test: `server/crypto/encryption.test.js`
- Create: `server/crypto/password.js`
- Test: `server/crypto/password.test.js`

- [ ] **Step 1: Write the failing test for encryption**

`server/crypto/encryption.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/crypto/encryption.test.js`
Expected: FAIL — `Cannot find module './encryption.js'`

- [ ] **Step 3: Write the implementation**

`server/crypto/encryption.js`:

```js
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(rawKey) {
	return crypto.createHash("sha256").update(String(rawKey)).digest();
}

export function encrypt(plaintext, rawKey) {
	const key = deriveKey(rawKey);
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(payload, rawKey) {
	const key = deriveKey(rawKey);
	const buf = Buffer.from(payload, "base64");
	const iv = buf.subarray(0, IV_LENGTH);
	const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
	const ciphertext = buf.subarray(IV_LENGTH + 16);
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/crypto/encryption.test.js`
Expected: 3 passing tests.

- [ ] **Step 5: Write the failing test for password hashing**

`server/crypto/password.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.js";

test("hashPassword produces a hash that verifyPassword accepts", async () => {
	const hash = await hashPassword("correct-horse-battery-staple");
	assert.notEqual(hash, "correct-horse-battery-staple");
	assert.equal(await verifyPassword("correct-horse-battery-staple", hash), true);
});

test("verifyPassword rejects a wrong password", async () => {
	const hash = await hashPassword("correct-horse-battery-staple");
	assert.equal(await verifyPassword("wrong-password", hash), false);
});
```

- [ ] **Step 6: Write the implementation**

`server/crypto/password.js`:

```js
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain) {
	return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain, hash) {
	return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/crypto`
Expected: 5 passing tests total.

- [ ] **Step 8: Commit**

```bash
git add server/crypto
git commit -m "feat: add AES-256-GCM encryption and bcrypt password helpers"
```

---

### Task 4: `computeFireAt` — the exact-registration-open-moment calculation

**Files:**
- Create: `server/scheduling/fireAt.js`
- Test: `server/scheduling/fireAt.test.js`

- [ ] **Step 1: Write the failing test**

`server/scheduling/fireAt.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFireAt } from "./fireAt.js";

test("a Sunday 18:00 class with a 72h window opens the preceding Thursday at 18:00 Asia/Jerusalem", () => {
	// 2026-07-19 is a Sunday. Thursday three days prior is 2026-07-16.
	const fireAt = computeFireAt("2026-07-19", "18:00", 72);
	assert.equal(fireAt.toISOString(), "2026-07-16T15:00:00.000Z"); // 18:00 IDT (UTC+3) = 15:00 UTC
});

test("a 48h window subtracts exactly 48 hours", () => {
	const fireAt = computeFireAt("2026-07-20", "06:00", 48);
	assert.equal(fireAt.toISOString(), "2026-07-18T03:00:00.000Z");
});

test("returns a Date instance", () => {
	assert.ok(computeFireAt("2026-07-20", "06:00", 48) instanceof Date);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/scheduling/fireAt.test.js`
Expected: FAIL — `Cannot find module './fireAt.js'`

- [ ] **Step 3: Write the implementation**

`server/scheduling/fireAt.js`:

```js
import { zonedTimeToUtc } from "date-fns-tz";
import { subHours } from "date-fns";
import { TIMEZONE } from "../arbox/constants.js";

export function computeFireAt(classDate, classTime, enableRegistrationHours) {
	const classStartUtc = zonedTimeToUtc(`${classDate} ${classTime}:00`, TIMEZONE);
	return subHours(classStartUtc, enableRegistrationHours);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/scheduling/fireAt.test.js`
Expected: 3 passing tests. (Depends on `server/arbox/constants.js` existing — created in Task 6; if running this test in isolation before Task 6, create a minimal `constants.js` with `export const TIMEZONE = "Asia/Jerusalem";` first, then finish `constants.js` fully in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add server/scheduling/fireAt.js server/scheduling/fireAt.test.js
git commit -m "feat: add computeFireAt — timezone-correct registration-open calculation"
```

---

### Task 5: Classify Arbox enroll responses (success / waitlisted / transient / terminal)

**Files:**
- Create: `server/scheduling/classifyEnrollResponse.js`
- Test: `server/scheduling/classifyEnrollResponse.test.js`

- [ ] **Step 1: Write the failing test**

`server/scheduling/classifyEnrollResponse.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEnrollResponse } from "./classifyEnrollResponse.js";

test("200 with user_booked set is success", () => {
	const result = classifyEnrollResponse(200, { data: { user_booked: 176875894, user_in_standby: null } });
	assert.equal(result.outcome, "success");
});

test("200 with user_in_standby set (and no user_booked) is waitlisted", () => {
	const result = classifyEnrollResponse(200, { data: { user_booked: null, user_in_standby: 123 } });
	assert.equal(result.outcome, "waitlisted");
});

test("514 Schedule Exception List is terminal, with the user-facing message extracted", () => {
	const body = {
		error: {
			message: "Schedule Exception List",
			messageToUser: [
				{ name: "categoryFrequencyRestricts", message: "You have reached your limit for category registrations." },
			],
			code: 514,
		},
	};
	const result = classifyEnrollResponse(514, body);
	assert.equal(result.outcome, "terminal");
	assert.equal(result.detail, "You have reached your limit for category registrations.");
});

test("500 is transient", () => {
	const result = classifyEnrollResponse(500, { message: "Server Error" });
	assert.equal(result.outcome, "transient");
});

test("503 is transient", () => {
	const result = classifyEnrollResponse(503, {});
	assert.equal(result.outcome, "transient");
});

test("403 with a plain error message is terminal", () => {
	const result = classifyEnrollResponse(403, { message: "Forbidden" });
	assert.equal(result.outcome, "terminal");
	assert.equal(result.detail, "Forbidden");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/scheduling/classifyEnrollResponse.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/scheduling/classifyEnrollResponse.js`:

```js
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function classifyEnrollResponse(status, body) {
	if (status === 200) {
		const data = body?.data;
		if (data?.user_booked) return { outcome: "success", detail: null };
		if (data?.user_in_standby) return { outcome: "waitlisted", detail: null };
		return { outcome: "terminal", detail: "Unexpected 200 response with no booking confirmation" };
	}

	if (TRANSIENT_STATUSES.has(status)) {
		return { outcome: "transient", detail: `HTTP ${status}` };
	}

	const messages = body?.error?.messageToUser;
	let detail;
	if (Array.isArray(messages) && messages.length > 0) {
		detail = messages.map((m) => m.message).filter(Boolean).join("; ");
	}
	detail = detail || body?.error?.message || body?.message || `HTTP ${status}`;

	return { outcome: "terminal", detail };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/scheduling/classifyEnrollResponse.test.js`
Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/scheduling/classifyEnrollResponse.js server/scheduling/classifyEnrollResponse.test.js
git commit -m "feat: add classifyEnrollResponse — transient vs terminal Arbox error handling"
```

---

### Task 6: Arbox API client

**Files:**
- Create: `server/arbox/constants.js`
- Create: `server/arbox/client.js`
- Test: `server/arbox/client.test.js`

- [ ] **Step 1: Write constants**

`server/arbox/constants.js`:

```js
export const WHITELABEL = process.env.ARBOX_WHITELABEL || "hypr-training";
export const BOX_ID = Number(process.env.ARBOX_BOX_ID || 59);
export const LOCATIONS_BOX_ID = Number(process.env.ARBOX_LOCATIONS_BOX_ID || 48);
export const TIMEZONE = "Asia/Jerusalem";
export const BASE_URL = "https://apiappv2.arboxapp.com";
```

- [ ] **Step 2: Write the failing test (fetch is injected, no real network calls)**

`server/arbox/client.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createArboxClient } from "./client.js";

function fakeFetch(responses) {
	let call = 0;
	const calls = [];
	const fn = async (url, opts) => {
		calls.push({ url, opts: { ...opts, body: opts.body ? JSON.parse(opts.body) : undefined } });
		const r = responses[call++];
		return { status: r.status, json: async () => r.body };
	};
	fn.calls = calls;
	return fn;
}

test("login sends the whitelabel header and returns token/refreshToken/fullName", async () => {
	const fetchImpl = fakeFetch([
		{ status: 200, body: { data: { token: "t1", refreshToken: "r1", full_name: "Alon W" } } },
	]);
	const client = createArboxClient({ fetchImpl });
	const result = await client.login("a@b.com", "pw");
	assert.equal(result.token, "t1");
	assert.equal(result.refreshToken, "r1");
	assert.equal(result.fullName, "Alon W");
	assert.equal(fetchImpl.calls[0].opts.headers.whitelabel, "hypr-training");
	assert.deepEqual(fetchImpl.calls[0].opts.body, { email: "a@b.com", password: "pw" });
});

test("login throws on non-200", async () => {
	const fetchImpl = fakeFetch([{ status: 403, body: { error: { messageToUser: "hasBrandedApp" } } }]);
	const client = createArboxClient({ fetchImpl });
	await assert.rejects(() => client.login("a@b.com", "wrong"));
});

test("getMembership picks the first active membership", async () => {
	const fetchImpl = fakeFetch([
		{
			status: 200,
			body: {
				data: [
					{ id: 111, active: 0 },
					{ id: 222, active: 1 },
				],
			},
		},
	]);
	const client = createArboxClient({ fetchImpl });
	const membershipId = await client.getMembership("t1", "r1");
	assert.equal(membershipId, 222);
});

test("getMembership throws if no active membership exists", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { data: [{ id: 111, active: 0 }] } }]);
	const client = createArboxClient({ fetchImpl });
	await assert.rejects(() => client.getMembership("t1", "r1"));
});

test("getScheduleBetweenDates returns the class list", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { data: [{ id: 1 }, { id: 2 }] } }]);
	const client = createArboxClient({ fetchImpl });
	const classes = await client.getScheduleBetweenDates("t1", "r1", "2026-07-19T00:00:00.000Z", "2026-07-26T00:00:00.000Z");
	assert.equal(classes.length, 2);
	assert.deepEqual(fetchImpl.calls[0].opts.body, {
		from: "2026-07-19T00:00:00.000Z",
		to: "2026-07-26T00:00:00.000Z",
		locations_box_id: 48,
		boxes_id: 59,
	});
});

test("enroll returns status and body without throwing on non-200 (caller classifies it)", async () => {
	const fetchImpl = fakeFetch([{ status: 514, body: { error: { message: "Schedule Exception List" } } }]);
	const client = createArboxClient({ fetchImpl });
	const result = await client.enroll("t1", "r1", { scheduleId: 5, membershipUserId: 9 });
	assert.equal(result.status, 514);
	assert.equal(result.body.error.message, "Schedule Exception List");
	assert.deepEqual(fetchImpl.calls[0].opts.body, { extras: null, membership_user_id: 9, schedule_id: 5 });
});

test("cancel posts to scheduleUser/delete with schedule_id and membership_user_id", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { data: {} } }]);
	const client = createArboxClient({ fetchImpl });
	await client.cancel("t1", "r1", { scheduleId: 5, membershipUserId: 9 });
	assert.ok(fetchImpl.calls[0].url.endsWith("/scheduleUser/delete"));
	assert.deepEqual(fetchImpl.calls[0].opts.body, { schedule_id: 5, membership_user_id: 9 });
});

test("getQuota returns used = past + future registrations", async () => {
	const fetchImpl = fakeFetch([{ status: 200, body: { scheduleUserStatus: { results: { past: "3", future: "1" } } } }]);
	const client = createArboxClient({ fetchImpl });
	const quota = await client.getQuota("t1", "r1");
	assert.equal(quota.used, 4);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/arbox/client.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

`server/arbox/client.js`:

```js
import nodeFetch from "node-fetch";
import { WHITELABEL, BOX_ID, LOCATIONS_BOX_ID, BASE_URL } from "./constants.js";

function authHeaders(token, refreshToken) {
	return {
		Accept: "application/json, text/plain, */*",
		"Content-Type": "application/json",
		whitelabel: WHITELABEL,
		...(token ? { accesstoken: token } : {}),
		...(refreshToken ? { refreshtoken: refreshToken } : {}),
	};
}

export function createArboxClient({ fetchImpl = nodeFetch } = {}) {
	async function login(email, password) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/user/login`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ email, password }),
		});
		const body = await res.json();
		if (res.status !== 200) {
			throw new Error(`Arbox login failed: ${JSON.stringify(body)}`);
		}
		return { token: body.data.token, refreshToken: body.data.refreshToken, fullName: body.data.full_name };
	}

	async function getMembership(token, refreshToken) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/boxes/${BOX_ID}/memberships/1`, {
			method: "GET",
			headers: authHeaders(token, refreshToken),
		});
		const body = await res.json();
		const active = (body.data || []).find((m) => m.active === 1);
		if (!active) throw new Error("No active Arbox membership found");
		return active.id;
	}

	async function getScheduleBetweenDates(token, refreshToken, from, to) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/schedule/betweenDates`, {
			method: "POST",
			headers: authHeaders(token, refreshToken),
			body: JSON.stringify({ from, locations_box_id: LOCATIONS_BOX_ID, to, boxes_id: BOX_ID }),
		});
		const body = await res.json();
		if (res.status !== 200) throw new Error(`Arbox schedule fetch failed: ${JSON.stringify(body)}`);
		return body.data;
	}

	async function enroll(token, refreshToken, { scheduleId, membershipUserId }) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/scheduleUser/insert`, {
			method: "POST",
			headers: authHeaders(token, refreshToken),
			body: JSON.stringify({ extras: null, membership_user_id: membershipUserId, schedule_id: scheduleId }),
		});
		const body = await res.json();
		return { status: res.status, body };
	}

	async function cancel(token, refreshToken, { scheduleId, membershipUserId }) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/scheduleUser/delete`, {
			method: "POST",
			headers: authHeaders(token, refreshToken),
			body: JSON.stringify({ schedule_id: scheduleId, membership_user_id: membershipUserId }),
		});
		const body = await res.json();
		if (res.status !== 200) throw new Error(`Arbox cancel failed: ${JSON.stringify(body)}`);
		return body;
	}

	async function getQuota(token, refreshToken) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/user/feed`, {
			method: "GET",
			headers: authHeaders(token, refreshToken),
		});
		const body = await res.json();
		const results = body?.scheduleUserStatus?.results || {};
		const used = Number(results.past || 0) + Number(results.future || 0);
		return { used };
	}

	return { login, getMembership, getScheduleBetweenDates, enroll, cancel, getQuota };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/arbox/client.test.js`
Expected: 8 passing tests.

- [ ] **Step 6: Re-run Task 4's test now that `constants.js` is final**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/scheduling/fireAt.test.js`
Expected: 3 passing tests.

- [ ] **Step 7: Commit**

```bash
git add server/arbox
git commit -m "feat: add Arbox API client (login, membership, schedule, enroll, cancel, quota)"
```

---

### Task 7: Repositories

**Files:**
- Create: `server/repositories/usersRepo.js`
- Create: `server/repositories/credentialsRepo.js`
- Create: `server/repositories/webhookRepo.js`
- Create: `server/repositories/jobsRepo.js`
- Test: `server/repositories/repositories.test.js`

- [ ] **Step 1: Write the failing test**

`server/repositories/repositories.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "./usersRepo.js";
import { createCredentialsRepo } from "./credentialsRepo.js";
import { createWebhookRepo } from "./webhookRepo.js";
import { createJobsRepo } from "./jobsRepo.js";

function setup() {
	const db = createDb(":memory:");
	return {
		db,
		usersRepo: createUsersRepo(db),
		credentialsRepo: createCredentialsRepo(db, "test-key"),
		webhookRepo: createWebhookRepo(db),
		jobsRepo: createJobsRepo(db),
	};
}

test("usersRepo: create, findByUsername, findById, count, list", () => {
	const { usersRepo } = setup();
	assert.equal(usersRepo.count(), 0);
	const user = usersRepo.create({ username: "alon", passwordHash: "hash1", isAdmin: true });
	assert.equal(usersRepo.count(), 1);
	assert.equal(usersRepo.findByUsername("alon").id, user.id);
	assert.equal(usersRepo.findById(user.id).username, "alon");
	assert.equal(usersRepo.list().length, 1);
	assert.equal(usersRepo.findByUsername("nope"), undefined);
});

test("credentialsRepo: set/get round-trips and decrypts the password", () => {
	const { usersRepo, credentialsRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	assert.equal(credentialsRepo.get(user.id), undefined);
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	const creds = credentialsRepo.get(user.id);
	assert.equal(creds.email, "a@b.com");
	assert.equal(creds.password, "gympw");
});

test("webhookRepo: set/get", () => {
	const { usersRepo, webhookRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	assert.equal(webhookRepo.get(user.id), null);
	webhookRepo.set(user.id, "https://example.com/hook");
	assert.equal(webhookRepo.get(user.id), "https://example.com/hook");
});

test("jobsRepo: create, listByUser, listPending, findById scoped to user, updateStatus", () => {
	const { usersRepo, jobsRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 555,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D Hall A",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T03:00:00.000Z",
	});
	assert.equal(job.status, "pending");
	assert.equal(jobsRepo.listByUser(user.id).length, 1);
	assert.equal(jobsRepo.listPending().length, 1);
	assert.equal(jobsRepo.findById(job.id, user.id).id, job.id);
	assert.equal(jobsRepo.findById(job.id, 999999), undefined);
	jobsRepo.updateStatus(job.id, "success", null);
	assert.equal(jobsRepo.findById(job.id, user.id).status, "success");
	assert.equal(jobsRepo.listPending().length, 0);
});

test("jobsRepo: findActiveByUserAndScheduleIds returns a map for already-scheduled annotation", () => {
	const { usersRepo, jobsRepo } = setup();
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	jobsRepo.create({
		userId: user.id,
		scheduleId: 555,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T03:00:00.000Z",
	});
	const map = jobsRepo.findActiveByUserAndScheduleIds(user.id, [555, 999]);
	assert.equal(map.get(555).status, "pending");
	assert.equal(map.has(999), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/repositories/repositories.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `usersRepo.js`**

```js
export function createUsersRepo(db) {
	return {
		count() {
			return db.prepare("SELECT COUNT(*) as n FROM users").get().n;
		},
		create({ username, passwordHash, isAdmin }) {
			const info = db
				.prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)")
				.run(username, passwordHash, isAdmin ? 1 : 0);
			return this.findById(info.lastInsertRowid);
		},
		findByUsername(username) {
			return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
		},
		findById(id) {
			return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
		},
		list() {
			return db.prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY id").all();
		},
	};
}
```

- [ ] **Step 4: Write `credentialsRepo.js`**

```js
import { encrypt, decrypt } from "../crypto/encryption.js";

export function createCredentialsRepo(db, encryptionKey) {
	return {
		get(userId) {
			const row = db.prepare("SELECT * FROM arbox_credentials WHERE user_id = ?").get(userId);
			if (!row) return undefined;
			return { email: row.email, password: decrypt(row.password_encrypted, encryptionKey) };
		},
		set(userId, { email, password }) {
			const passwordEncrypted = encrypt(password, encryptionKey);
			db.prepare(
				`INSERT INTO arbox_credentials (user_id, email, password_encrypted, updated_at)
				 VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
				 ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, password_encrypted = excluded.password_encrypted, updated_at = excluded.updated_at`
			).run(userId, email, passwordEncrypted);
		},
	};
}
```

- [ ] **Step 5: Write `webhookRepo.js`**

```js
export function createWebhookRepo(db) {
	return {
		get(userId) {
			const row = db.prepare("SELECT webhook_url FROM webhook_settings WHERE user_id = ?").get(userId);
			return row ? row.webhook_url : null;
		},
		set(userId, webhookUrl) {
			db.prepare(
				`INSERT INTO webhook_settings (user_id, webhook_url) VALUES (?, ?)
				 ON CONFLICT(user_id) DO UPDATE SET webhook_url = excluded.webhook_url`
			).run(userId, webhookUrl);
		},
	};
}
```

- [ ] **Step 6: Write `jobsRepo.js`**

```js
export function createJobsRepo(db) {
	return {
		create({ userId, scheduleId, classDate, classTime, className, enableRegistrationTime, fireAt }) {
			const info = db
				.prepare(
					`INSERT INTO scheduled_jobs
					 (user_id, schedule_id, class_date, class_time, class_name, enable_registration_time, fire_at, status)
					 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
				)
				.run(userId, scheduleId, classDate, classTime, className, enableRegistrationTime, fireAt);
			return this.findByIdUnscoped(info.lastInsertRowid);
		},
		findByIdUnscoped(id) {
			return db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id);
		},
		findById(id, userId) {
			return db.prepare("SELECT * FROM scheduled_jobs WHERE id = ? AND user_id = ?").get(id, userId);
		},
		listByUser(userId) {
			return db
				.prepare("SELECT * FROM scheduled_jobs WHERE user_id = ? ORDER BY fire_at DESC")
				.all(userId);
		},
		listPending() {
			return db.prepare("SELECT * FROM scheduled_jobs WHERE status = 'pending'").all();
		},
		findActiveByUserAndScheduleIds(userId, scheduleIds) {
			if (scheduleIds.length === 0) return new Map();
			const placeholders = scheduleIds.map(() => "?").join(",");
			const rows = db
				.prepare(
					`SELECT * FROM scheduled_jobs
					 WHERE user_id = ? AND schedule_id IN (${placeholders})
					 AND status IN ('pending', 'fired', 'success', 'waitlisted')`
				)
				.all(userId, ...scheduleIds);
			return new Map(rows.map((r) => [r.schedule_id, r]));
		},
		updateStatus(id, status, resultDetail) {
			db.prepare(
				`UPDATE scheduled_jobs SET status = ?, result_detail = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
			).run(status, resultDetail, id);
		},
	};
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/repositories/repositories.test.js`
Expected: 5 passing tests.

- [ ] **Step 8: Commit**

```bash
git add server/repositories
git commit -m "feat: add repositories for users, arbox credentials, webhooks, jobs"
```

---

### Task 8: Auth — bootstrap admin, JWT session, middleware, routes

**Files:**
- Create: `server/auth/bootstrapAdmin.js`
- Create: `server/auth/jwt.js`
- Create: `server/auth/middleware.js`
- Create: `server/routes/authRoutes.js`
- Test: `server/auth/auth.test.js`

- [ ] **Step 1: Write the failing test**

`server/auth/auth.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { hashPassword } from "../crypto/password.js";
import { bootstrapAdmin } from "./bootstrapAdmin.js";
import { signSession, verifySession } from "./jwt.js";
import { createAuthRoutes } from "../routes/authRoutes.js";
import { requireAuth, requireAdmin } from "./middleware.js";

const JWT_SECRET = "test-jwt-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use("/api", createAuthRoutes({ usersRepo, jwtSecret: JWT_SECRET }));
	app.get("/api/protected", requireAuth({ jwtSecret: JWT_SECRET }), (req, res) => res.json({ userId: req.user.id }));
	app.get("/api/admin-only", requireAuth({ jwtSecret: JWT_SECRET }), requireAdmin, (req, res) => res.json({ ok: true }));
	return { db, usersRepo, app };
}

test("bootstrapAdmin creates the admin user only when the users table is empty", async () => {
	const { db, usersRepo } = setup();
	await bootstrapAdmin({ usersRepo, username: "admin", password: "adminpw" });
	assert.equal(usersRepo.count(), 1);
	const admin = usersRepo.findByUsername("admin");
	assert.equal(admin.is_admin, 1);
	await bootstrapAdmin({ usersRepo, username: "admin2", password: "other" });
	assert.equal(usersRepo.count(), 1); // did not create a second one
	db.close();
});

test("signSession/verifySession round-trip", () => {
	const token = signSession({ id: 1, isAdmin: true }, JWT_SECRET);
	const payload = verifySession(token, JWT_SECRET);
	assert.equal(payload.id, 1);
	assert.equal(payload.isAdmin, true);
});

test("POST /api/login with correct credentials sets a session cookie", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const res = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	assert.equal(res.status, 200);
	assert.ok(res.headers["set-cookie"][0].startsWith("session="));
});

test("POST /api/login with wrong password returns 401", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const res = await request(app).post("/api/login").send({ username: "alon", password: "wrong" });
	assert.equal(res.status, 401);
});

test("requireAuth rejects requests without a valid session cookie", async () => {
	const { app } = setup();
	const res = await request(app).get("/api/protected");
	assert.equal(res.status, 401);
});

test("requireAuth allows requests with a valid session cookie", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const loginRes = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	const cookie = loginRes.headers["set-cookie"];
	const res = await request(app).get("/api/protected").set("Cookie", cookie);
	assert.equal(res.status, 200);
});

test("requireAdmin rejects non-admin users", async () => {
	const { usersRepo, app } = setup();
	usersRepo.create({ username: "alon", passwordHash: await hashPassword("secret123"), isAdmin: false });
	const loginRes = await request(app).post("/api/login").send({ username: "alon", password: "secret123" });
	const cookie = loginRes.headers["set-cookie"];
	const res = await request(app).get("/api/admin-only").set("Cookie", cookie);
	assert.equal(res.status, 403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/auth/auth.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `jwt.js`**

```js
import jwt from "jsonwebtoken";

const EXPIRES_IN = "30d";

export function signSession(user, secret) {
	return jwt.sign({ id: user.id, isAdmin: !!user.isAdmin }, secret, { expiresIn: EXPIRES_IN });
}

export function verifySession(token, secret) {
	return jwt.verify(token, secret);
}
```

- [ ] **Step 4: Write `bootstrapAdmin.js`**

```js
import { hashPassword } from "../crypto/password.js";

export async function bootstrapAdmin({ usersRepo, username, password }) {
	if (usersRepo.count() > 0) return;
	if (!username || !password) {
		throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set to bootstrap the first account");
	}
	usersRepo.create({ username, passwordHash: await hashPassword(password), isAdmin: true });
}
```

`bootstrapAdmin` is async (it calls the async `hashPassword`) — every caller, including `server/index.js` in Task 15, must `await` it.

- [ ] **Step 5: Write `middleware.js`**

```js
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
```

- [ ] **Step 6: Write `authRoutes.js`**

```js
import express from "express";
import { verifyPassword } from "../crypto/password.js";
import { signSession } from "../auth/jwt.js";

export function createAuthRoutes({ usersRepo, jwtSecret }) {
	const router = express.Router();

	router.post("/login", async (req, res) => {
		const { username, password } = req.body || {};
		const user = usersRepo.findByUsername(username);
		if (!user || !(await verifyPassword(password, user.password_hash))) {
			return res.status(401).json({ error: "Invalid username or password" });
		}
		const token = signSession({ id: user.id, isAdmin: user.is_admin }, jwtSecret);
		res.cookie("session", token, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			maxAge: 30 * 24 * 60 * 60 * 1000,
		});
		res.json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
	});

	router.post("/logout", (req, res) => {
		res.clearCookie("session");
		res.status(204).end();
	});

	router.get("/me", (req, res) => {
		const token = req.cookies?.session;
		if (!token) return res.status(401).json({ error: "Not authenticated" });
		res.json({ authenticated: true });
	});

	return router;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/auth/auth.test.js`
Expected: 7 passing tests.

- [ ] **Step 8: Commit**

```bash
git add server/auth server/routes/authRoutes.js
git commit -m "feat: add JWT session auth, admin bootstrap, login/logout routes"
```

---

### Task 9: Credentials & webhook routes

**Files:**
- Create: `server/routes/credentialsRoutes.js`
- Create: `server/routes/webhookRoutes.js`
- Test: `server/routes/credentialsAndWebhook.test.js`

- [ ] **Step 1: Write the failing test**

`server/routes/credentialsAndWebhook.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { createWebhookRepo } from "../repositories/webhookRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createCredentialsRoutes } from "./credentialsRoutes.js";
import { createWebhookRoutes } from "./webhookRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const webhookRepo = createWebhookRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/me/arbox-credentials", createCredentialsRoutes({ credentialsRepo }));
	app.use("/api/me/webhook", createWebhookRoutes({ webhookRepo }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user };
}

test("GET credentials before any are set returns hasPassword: false", async () => {
	const { app, cookie } = setup();
	const res = await request(app).get("/api/me/arbox-credentials").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.hasPassword, false);
});

test("PUT then GET credentials never exposes the raw or encrypted password", async () => {
	const { app, cookie } = setup();
	const putRes = await request(app)
		.put("/api/me/arbox-credentials")
		.set("Cookie", cookie)
		.send({ email: "a@b.com", password: "gympw" });
	assert.equal(putRes.status, 200);
	const getRes = await request(app).get("/api/me/arbox-credentials").set("Cookie", cookie);
	assert.equal(getRes.body.email, "a@b.com");
	assert.equal(getRes.body.hasPassword, true);
	assert.equal(getRes.body.password, undefined);
});

test("webhook GET/PUT round-trips the URL", async () => {
	const { app, cookie } = setup();
	const getBefore = await request(app).get("/api/me/webhook").set("Cookie", cookie);
	assert.equal(getBefore.body.webhookUrl, null);
	await request(app).put("/api/me/webhook").set("Cookie", cookie).send({ webhookUrl: "https://x.test/hook" });
	const getAfter = await request(app).get("/api/me/webhook").set("Cookie", cookie);
	assert.equal(getAfter.body.webhookUrl, "https://x.test/hook");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/routes/credentialsAndWebhook.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `credentialsRoutes.js`**

```js
import express from "express";

export function createCredentialsRoutes({ credentialsRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		const creds = credentialsRepo.get(req.user.id);
		res.json({ email: creds?.email || null, hasPassword: !!creds });
	});

	router.put("/", (req, res) => {
		const { email, password } = req.body || {};
		if (!email || !password) return res.status(400).json({ error: "email and password are required" });
		credentialsRepo.set(req.user.id, { email, password });
		res.json({ email, hasPassword: true });
	});

	return router;
}
```

- [ ] **Step 4: Write `webhookRoutes.js`**

```js
import express from "express";

export function createWebhookRoutes({ webhookRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		res.json({ webhookUrl: webhookRepo.get(req.user.id) });
	});

	router.put("/", (req, res) => {
		const { webhookUrl } = req.body || {};
		webhookRepo.set(req.user.id, webhookUrl || null);
		res.json({ webhookUrl: webhookUrl || null });
	});

	return router;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/routes/credentialsAndWebhook.test.js`
Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add server/routes/credentialsRoutes.js server/routes/webhookRoutes.js server/routes/credentialsAndWebhook.test.js
git commit -m "feat: add arbox-credentials and webhook settings routes"
```

---

### Task 10: Schedule route

**Files:**
- Create: `server/routes/scheduleRoutes.js`
- Test: `server/routes/scheduleRoutes.test.js`

- [ ] **Step 1: Write the failing test**

`server/routes/scheduleRoutes.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { createJobsRepo } from "../repositories/jobsRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createScheduleRoutes } from "./scheduleRoutes.js";

const JWT_SECRET = "test-secret";

function fakeArboxClient(classes) {
	return {
		login: async () => ({ token: "t", refreshToken: "r", fullName: "Alon" }),
		getScheduleBetweenDates: async () => classes,
		getQuota: async () => ({ used: 4 }),
	};
}

function setup(classes) {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	const arboxClient = fakeArboxClient(classes);
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/schedule", createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, maxClassesPerMonth: 12 }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, jobsRepo };
}

test("GET /api/schedule annotates each class with fire_at and quota", async () => {
	const { app, cookie } = setup([
		{
			id: 57247379,
			date: "2026-07-20",
			time: "06:00",
			box_categories: { name: "W.O.D Hall A" },
			enable_registration_time: 72,
		},
	]);
	const res = await request(app).get("/api/schedule?days=7").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.classes.length, 1);
	assert.equal(res.body.classes[0].fireAt, "2026-07-17T03:00:00.000Z");
	assert.equal(res.body.classes[0].alreadyScheduled, false);
	assert.equal(res.body.quota.used, 4);
	assert.equal(res.body.quota.limit, 12);
});

test("GET /api/schedule marks a class already_scheduled when a job exists", async () => {
	const { app, cookie, user, jobsRepo } = setup([
		{
			id: 57247379,
			date: "2026-07-20",
			time: "06:00",
			box_categories: { name: "W.O.D Hall A" },
			enable_registration_time: 72,
		},
	]);
	jobsRepo.create({
		userId: user.id,
		scheduleId: 57247379,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D Hall A",
		enableRegistrationTime: 72,
		fireAt: "2026-07-17T03:00:00.000Z",
	});
	const res = await request(app).get("/api/schedule?days=7").set("Cookie", cookie);
	assert.equal(res.body.classes[0].alreadyScheduled, true);
	assert.equal(res.body.classes[0].jobStatus, "pending");
});

test("GET /api/schedule returns 400 when the user has no arbox credentials configured", async () => {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use(
		"/api/schedule",
		createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient: fakeArboxClient([]), maxClassesPerMonth: 12 })
	);
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	const res = await request(app).get("/api/schedule").set("Cookie", cookie);
	assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/routes/scheduleRoutes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/routes/scheduleRoutes.js`:

```js
import express from "express";
import { computeFireAt } from "../scheduling/fireAt.js";

export function createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, maxClassesPerMonth }) {
	const router = express.Router();

	router.get("/", async (req, res) => {
		const creds = credentialsRepo.get(req.user.id);
		if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

		const days = Number(req.query.days || 7);
		const from = new Date();
		from.setUTCHours(0, 0, 0, 0);
		const to = new Date(from);
		to.setUTCDate(to.getUTCDate() + days);

		const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
		const [rawClasses, quota] = await Promise.all([
			arboxClient.getScheduleBetweenDates(token, refreshToken, from.toISOString(), to.toISOString()),
			arboxClient.getQuota(token, refreshToken),
		]);

		const scheduleIds = rawClasses.map((c) => c.id);
		const jobsByScheduleId = jobsRepo.findActiveByUserAndScheduleIds(req.user.id, scheduleIds);

		const classes = rawClasses.map((c) => {
			const fireAt = computeFireAt(c.date, c.time, c.enable_registration_time).toISOString();
			const job = jobsByScheduleId.get(c.id);
			return {
				id: c.id,
				date: c.date,
				time: c.time,
				name: c.box_categories?.name?.trim(),
				coach: c.coach?.full_name,
				maxUsers: c.max_users,
				bookedCount: (c.booked_users || []).length,
				enableRegistrationTime: c.enable_registration_time,
				fireAt,
				alreadyScheduled: !!job,
				jobStatus: job?.status || null,
				jobId: job?.id || null,
			};
		});

		res.json({ classes, quota: { used: quota.used, limit: maxClassesPerMonth } });
	});

	return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/routes/scheduleRoutes.test.js`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/routes/scheduleRoutes.js server/routes/scheduleRoutes.test.js
git commit -m "feat: add GET /api/schedule with fire_at annotation and quota"
```

---

### Task 11: Scheduling engine (`JobScheduler`)

**Files:**
- Create: `server/scheduling/engine.js`
- Test: `server/scheduling/engine.test.js`

- [ ] **Step 1: Write the failing test**

`server/scheduling/engine.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { createJobsRepo } from "../repositories/jobsRepo.js";
import { createJobScheduler } from "./engine.js";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });
	return { db, user, credentialsRepo, jobsRepo };
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

test("arm() fires the job at fire_at and records success", async () => {
	const { user, credentialsRepo, jobsRepo } = setup();
	const notified = [];
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => ({ status: 200, body: { data: { user_booked: 123, user_in_standby: null } } }),
	};
	const scheduler = createJobScheduler({
		jobsRepo,
		credentialsRepo,
		arboxClient,
		notify: async (userId, event, payload) => notified.push({ userId, event, payload }),
		retryIntervalMs: 10,
		retryWindowMs: 50,
	});
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 1,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 60).toISOString(),
	});
	scheduler.arm(job);
	await sleep(300);
	assert.equal(jobsRepo.findByIdUnscoped(job.id).status, "success");
	assert.equal(notified.length, 1);
	assert.equal(notified[0].event, "success");
});

test("arm() retries on transient failure then succeeds", async () => {
	const { user, jobsRepo, credentialsRepo } = setup();
	let attempts = 0;
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => {
			attempts++;
			if (attempts < 3) return { status: 500, body: {} };
			return { status: 200, body: { data: { user_booked: 1, user_in_standby: null } } };
		},
	};
	const scheduler = createJobScheduler({
		jobsRepo,
		credentialsRepo,
		arboxClient,
		notify: async () => {},
		retryIntervalMs: 10,
		retryWindowMs: 200,
	});
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 2,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 30).toISOString(),
	});
	scheduler.arm(job);
	await sleep(300);
	assert.ok(attempts >= 3);
	assert.equal(jobsRepo.findByIdUnscoped(job.id).status, "success");
});

test("arm() stops immediately on a terminal (business-rule) rejection", async () => {
	const { user, jobsRepo, credentialsRepo } = setup();
	let attempts = 0;
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => {
			attempts++;
			return { status: 514, body: { error: { messageToUser: [{ message: "limit reached" }] } } };
		},
	};
	const scheduler = createJobScheduler({
		jobsRepo,
		credentialsRepo,
		arboxClient,
		notify: async () => {},
		retryIntervalMs: 10,
		retryWindowMs: 200,
	});
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 3,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 30).toISOString(),
	});
	scheduler.arm(job);
	await sleep(300);
	assert.equal(attempts, 1);
	const finalJob = jobsRepo.findByIdUnscoped(job.id);
	assert.equal(finalJob.status, "failed");
	assert.equal(finalJob.result_detail, "limit reached");
});

test("cancelTimer prevents a not-yet-fired job from firing", async () => {
	const { user, jobsRepo, credentialsRepo } = setup();
	let attempts = 0;
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => {
			attempts++;
			return { status: 200, body: { data: { user_booked: 1 } } };
		},
	};
	const scheduler = createJobScheduler({ jobsRepo, credentialsRepo, arboxClient, notify: async () => {} });
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 4,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 100).toISOString(),
	});
	scheduler.arm(job);
	scheduler.cancelTimer(job.id);
	await sleep(300);
	assert.equal(attempts, 0);
});

test("boot() re-arms pending jobs with a future fire_at, and marks past-due ones missed", async () => {
	const { user, jobsRepo, credentialsRepo } = setup();
	const notified = [];
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getMembership: async () => 999,
		enroll: async () => ({ status: 200, body: { data: { user_booked: 1 } } }),
	};
	const futureJob = jobsRepo.create({
		userId: user.id,
		scheduleId: 5,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() + 50).toISOString(),
	});
	const pastJob = jobsRepo.create({
		userId: user.id,
		scheduleId: 6,
		classDate: "2026-07-18",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date(Date.now() - 5000).toISOString(),
	});
	const scheduler = createJobScheduler({
		jobsRepo,
		credentialsRepo,
		arboxClient,
		notify: async (userId, event, payload) => notified.push({ event, payload }),
	});
	scheduler.boot();
	await sleep(300);
	assert.equal(jobsRepo.findByIdUnscoped(futureJob.id).status, "success");
	assert.equal(jobsRepo.findByIdUnscoped(pastJob.id).status, "missed");
	assert.ok(notified.some((n) => n.event === "missed"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/scheduling/engine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/scheduling/engine.js`:

```js
import { classifyEnrollResponse } from "./classifyEnrollResponse.js";

const LEAD_MS = 150;
const SPIN_INTERVAL_MS = 5;
const DEFAULT_RETRY_INTERVAL_MS = 300;
const DEFAULT_RETRY_WINDOW_MS = 5000;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createJobScheduler({
	jobsRepo,
	credentialsRepo,
	arboxClient,
	notify,
	retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
	retryWindowMs = DEFAULT_RETRY_WINDOW_MS,
}) {
	const timers = new Map(); // jobId -> { timeout }

	function boot() {
		for (const job of jobsRepo.listPending()) {
			const fireAt = new Date(job.fire_at).getTime();
			if (fireAt <= Date.now()) {
				jobsRepo.updateStatus(job.id, "missed", "Server was offline when registration opened");
				notify(job.user_id, "missed", { classId: job.schedule_id, className: job.class_name, date: job.class_date, time: job.class_time });
			} else {
				arm(job);
			}
		}
	}

	function arm(job) {
		const delayMs = new Date(job.fire_at).getTime() - Date.now();
		const coarseDelay = Math.max(delayMs - LEAD_MS, 0);
		const timeout = setTimeout(() => spinFire(job), coarseDelay);
		timers.set(job.id, { timeout });
	}

	async function spinFire(job) {
		const target = new Date(job.fire_at).getTime();
		while (Date.now() < target) {
			await sleep(SPIN_INTERVAL_MS);
		}
		timers.delete(job.id);
		await fireJob(job);
	}

	function cancelTimer(jobId) {
		const entry = timers.get(jobId);
		if (entry) {
			clearTimeout(entry.timeout);
			timers.delete(jobId);
		}
	}

	async function fireJob(job) {
		const creds = credentialsRepo.get(job.user_id);
		if (!creds) {
			jobsRepo.updateStatus(job.id, "failed", "Arbox credentials no longer configured");
			await notify(job.user_id, "failed", { classId: job.schedule_id, className: job.class_name, date: job.class_date, time: job.class_time, detail: "Arbox credentials no longer configured" });
			return;
		}

		const deadline = Date.now() + retryWindowMs;
		let outcome;
		let detail;

		while (Date.now() < deadline) {
			try {
				const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
				const membershipUserId = await arboxClient.getMembership(token, refreshToken);
				const { status, body } = await arboxClient.enroll(token, refreshToken, {
					scheduleId: job.schedule_id,
					membershipUserId,
				});
				const classification = classifyEnrollResponse(status, body);
				outcome = classification.outcome;
				detail = classification.detail;
				if (outcome !== "transient") break;
			} catch (err) {
				outcome = "transient";
				detail = err.message;
			}
			await sleep(retryIntervalMs);
		}

		const finalStatus = outcome === "transient" ? "failed" : outcome;
		const finalDetail = outcome === "transient" ? `Exhausted retries: ${detail}` : detail;
		jobsRepo.updateStatus(job.id, finalStatus, finalDetail);
		await notify(job.user_id, finalStatus, {
			classId: job.schedule_id,
			className: job.class_name,
			date: job.class_date,
			time: job.class_time,
			detail: finalDetail,
		});
	}

	return { boot, arm, cancelTimer, fireJob };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/scheduling/engine.test.js`
Expected: 5 passing tests. (These use small real delays, ~50-300ms each; the suite should complete in a couple seconds.)

- [ ] **Step 5: Commit**

```bash
git add server/scheduling/engine.js server/scheduling/engine.test.js
git commit -m "feat: add JobScheduler — precise-fire timer, burst retry, boot re-arm"
```

---

### Task 12: Jobs routes

**Files:**
- Create: `server/routes/jobsRoutes.js`
- Test: `server/routes/jobsRoutes.test.js`

- [ ] **Step 1: Write the failing test**

`server/routes/jobsRoutes.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { createCredentialsRepo } from "../repositories/credentialsRepo.js";
import { createJobsRepo } from "../repositories/jobsRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { createJobsRoutes } from "./jobsRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const credentialsRepo = createCredentialsRepo(db, "enc-key");
	const jobsRepo = createJobsRepo(db);
	const user = usersRepo.create({ username: "alon", passwordHash: "h", isAdmin: false });
	credentialsRepo.set(user.id, { email: "a@b.com", password: "gympw" });

	const armedJobs = [];
	const cancelledJobIds = [];
	const scheduler = {
		arm: (job) => armedJobs.push(job.id),
		cancelTimer: (id) => cancelledJobIds.push(id),
	};
	const arboxClient = {
		login: async () => ({ token: "t", refreshToken: "r" }),
		getScheduleBetweenDates: async () => [
			{ id: 111, date: "2026-07-20", time: "06:00", box_categories: { name: "W.O.D" }, enable_registration_time: 72 },
		],
		getMembership: async () => 999,
		cancel: async () => ({}),
	};

	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }));
	app.use("/api/jobs", createJobsRoutes({ jobsRepo, credentialsRepo, arboxClient, scheduler }));
	const cookie = `session=${signSession({ id: user.id, isAdmin: false }, JWT_SECRET)}`;
	return { app, cookie, user, jobsRepo, armedJobs, cancelledJobIds };
}

test("POST /api/jobs creates a job, arms the scheduler, and returns it", async () => {
	const { app, cookie, armedJobs } = setup();
	const res = await request(app).post("/api/jobs").set("Cookie", cookie).send({ scheduleId: 111, classDate: "2026-07-20" });
	assert.equal(res.status, 201);
	assert.equal(res.body.scheduleId, 111);
	assert.equal(res.body.status, "pending");
	assert.equal(armedJobs.length, 1);
});

test("POST /api/jobs 404s when the class can't be found on that date", async () => {
	const { app, cookie } = setup();
	const res = await request(app).post("/api/jobs").set("Cookie", cookie).send({ scheduleId: 999, classDate: "2026-07-20" });
	assert.equal(res.status, 404);
});

test("GET /api/jobs lists the user's jobs", async () => {
	const { app, cookie } = setup();
	await request(app).post("/api/jobs").set("Cookie", cookie).send({ scheduleId: 111, classDate: "2026-07-20" });
	const res = await request(app).get("/api/jobs").set("Cookie", cookie);
	assert.equal(res.body.length, 1);
});

test("DELETE /api/jobs/:id on a pending job cancels the timer and marks cancelled", async () => {
	const { app, cookie, cancelledJobIds } = setup();
	const createRes = await request(app).post("/api/jobs").set("Cookie", cookie).send({ scheduleId: 111, classDate: "2026-07-20" });
	const res = await request(app).delete(`/api/jobs/${createRes.body.id}`).set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.status, "cancelled");
	assert.deepEqual(cancelledJobIds, [createRes.body.id]);
});

test("DELETE /api/jobs/:id on a successful job cancels the real Arbox booking", async () => {
	const { app, cookie, jobsRepo, user } = setup();
	const job = jobsRepo.create({
		userId: user.id,
		scheduleId: 111,
		classDate: "2026-07-20",
		classTime: "06:00",
		className: "W.O.D",
		enableRegistrationTime: 72,
		fireAt: new Date().toISOString(),
	});
	jobsRepo.updateStatus(job.id, "success", null);
	const res = await request(app).delete(`/api/jobs/${job.id}`).set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.status, "cancelled");
});

test("DELETE /api/jobs/:id 404s for a job that doesn't belong to the caller", async () => {
	const { app, cookie } = setup();
	const res = await request(app).delete("/api/jobs/999999").set("Cookie", cookie);
	assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/routes/jobsRoutes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/routes/jobsRoutes.js`:

```js
import express from "express";
import { computeFireAt } from "../scheduling/fireAt.js";

export function createJobsRoutes({ jobsRepo, credentialsRepo, arboxClient, scheduler }) {
	const router = express.Router();

	router.post("/", async (req, res) => {
		const { scheduleId, classDate } = req.body || {};
		const creds = credentialsRepo.get(req.user.id);
		if (!creds) return res.status(400).json({ error: "Arbox credentials not configured" });

		const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
		const dayStart = `${classDate}T00:00:00.000Z`;
		const classes = await arboxClient.getScheduleBetweenDates(token, refreshToken, dayStart, dayStart);
		const targetClass = classes.find((c) => c.id === scheduleId);
		if (!targetClass) return res.status(404).json({ error: "Class not found for that date" });

		const fireAt = computeFireAt(targetClass.date, targetClass.time, targetClass.enable_registration_time).toISOString();
		const job = jobsRepo.create({
			userId: req.user.id,
			scheduleId: targetClass.id,
			classDate: targetClass.date,
			classTime: targetClass.time,
			className: targetClass.box_categories?.name?.trim() || "",
			enableRegistrationTime: targetClass.enable_registration_time,
			fireAt,
		});
		scheduler.arm(job);
		res.status(201).json(toApiJob(job));
	});

	router.get("/", (req, res) => {
		res.json(jobsRepo.listByUser(req.user.id).map(toApiJob));
	});

	router.delete("/:id", async (req, res) => {
		const job = jobsRepo.findById(Number(req.params.id), req.user.id);
		if (!job) return res.status(404).json({ error: "Job not found" });

		if (job.status === "pending") {
			scheduler.cancelTimer(job.id);
			jobsRepo.updateStatus(job.id, "cancelled", null);
		} else if (job.status === "success" || job.status === "waitlisted") {
			const creds = credentialsRepo.get(req.user.id);
			const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
			const membershipUserId = await arboxClient.getMembership(token, refreshToken);
			await arboxClient.cancel(token, refreshToken, { scheduleId: job.schedule_id, membershipUserId });
			jobsRepo.updateStatus(job.id, "cancelled", null);
		} else {
			return res.status(400).json({ error: `Cannot cancel a job in status "${job.status}"` });
		}

		res.json(toApiJob(jobsRepo.findById(job.id, req.user.id)));
	});

	return router;
}

function toApiJob(job) {
	return {
		id: job.id,
		scheduleId: job.schedule_id,
		classDate: job.class_date,
		classTime: job.class_time,
		className: job.class_name,
		fireAt: job.fire_at,
		status: job.status,
		resultDetail: job.result_detail,
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/routes/jobsRoutes.test.js`
Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/routes/jobsRoutes.js server/routes/jobsRoutes.test.js
git commit -m "feat: add jobs routes (create/list/cancel scheduled enrollments)"
```

---

### Task 13: Webhook notifications

**Files:**
- Create: `server/notifications/sendWebhook.js`
- Test: `server/notifications/sendWebhook.test.js`

- [ ] **Step 1: Write the failing test**

`server/notifications/sendWebhook.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNotifier } from "./sendWebhook.js";

function fakeFetch(calls) {
	return async (url, opts) => {
		calls.push({ url, body: JSON.parse(opts.body) });
		return { status: 200 };
	};
}

test("posts the event payload to the user's configured webhook URL", async () => {
	const calls = [];
	const webhookRepo = { get: () => "https://x.test/hook" };
	const notify = createNotifier({ webhookRepo, fetchImpl: fakeFetch(calls) });
	await notify(1, "success", { classId: 5, className: "W.O.D", date: "2026-07-20", time: "06:00" });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, "https://x.test/hook");
	assert.equal(calls[0].body.event, "success");
	assert.equal(calls[0].body.className, "W.O.D");
});

test("does nothing when the user has no webhook configured", async () => {
	const calls = [];
	const webhookRepo = { get: () => null };
	const notify = createNotifier({ webhookRepo, fetchImpl: fakeFetch(calls) });
	await notify(1, "success", { classId: 5 });
	assert.equal(calls.length, 0);
});

test("swallows fetch errors so a broken webhook can't crash the scheduler", async () => {
	const webhookRepo = { get: () => "https://x.test/hook" };
	const notify = createNotifier({ webhookRepo, fetchImpl: async () => { throw new Error("network down"); } });
	await assert.doesNotReject(() => notify(1, "success", { classId: 5 }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/notifications/sendWebhook.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/notifications/sendWebhook.js`:

```js
import nodeFetch from "node-fetch";

export function createNotifier({ webhookRepo, fetchImpl = nodeFetch }) {
	return async function notify(userId, event, payload) {
		const webhookUrl = webhookRepo.get(userId);
		if (!webhookUrl) return;
		try {
			await fetchImpl(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ event, ...payload }),
			});
		} catch (err) {
			console.log(`Webhook notification failed for user ${userId}:`, err.message);
		}
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/notifications/sendWebhook.test.js`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/notifications
git commit -m "feat: add generic webhook notifier for job outcomes"
```

---

### Task 14: Admin users routes

**Files:**
- Create: `server/routes/adminRoutes.js`
- Test: `server/routes/adminRoutes.test.js`

- [ ] **Step 1: Write the failing test**

`server/routes/adminRoutes.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createDb } from "../db/index.js";
import { createUsersRepo } from "../repositories/usersRepo.js";
import { signSession } from "../auth/jwt.js";
import { requireAuth, requireAdmin } from "../auth/middleware.js";
import { createAdminRoutes } from "./adminRoutes.js";

const JWT_SECRET = "test-secret";

function setup() {
	const db = createDb(":memory:");
	const usersRepo = createUsersRepo(db);
	const admin = usersRepo.create({ username: "admin", passwordHash: "h", isAdmin: true });
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use(requireAuth({ jwtSecret: JWT_SECRET }), requireAdmin);
	app.use("/api/admin/users", createAdminRoutes({ usersRepo }));
	const cookie = `session=${signSession({ id: admin.id, isAdmin: true }, JWT_SECRET)}`;
	return { app, cookie, usersRepo };
}

test("GET /api/admin/users lists accounts without password hashes", async () => {
	const { app, cookie } = setup();
	const res = await request(app).get("/api/admin/users").set("Cookie", cookie);
	assert.equal(res.status, 200);
	assert.equal(res.body.length, 1);
	assert.equal(res.body[0].username, "admin");
	assert.equal(res.body[0].password_hash, undefined);
});

test("POST /api/admin/users creates a new account", async () => {
	const { app, cookie, usersRepo } = setup();
	const res = await request(app).post("/api/admin/users").set("Cookie", cookie).send({ username: "friend", password: "friendpw" });
	assert.equal(res.status, 201);
	assert.equal(res.body.username, "friend");
	assert.ok(usersRepo.findByUsername("friend"));
});

test("POST /api/admin/users rejects a duplicate username", async () => {
	const { app, cookie } = setup();
	await request(app).post("/api/admin/users").set("Cookie", cookie).send({ username: "friend", password: "pw1" });
	const res = await request(app).post("/api/admin/users").set("Cookie", cookie).send({ username: "friend", password: "pw2" });
	assert.equal(res.status, 409);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/routes/adminRoutes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/routes/adminRoutes.js`:

```js
import express from "express";
import { hashPassword } from "../crypto/password.js";

export function createAdminRoutes({ usersRepo }) {
	const router = express.Router();

	router.get("/", (req, res) => {
		res.json(usersRepo.list());
	});

	router.post("/", async (req, res) => {
		const { username, password, isAdmin } = req.body || {};
		if (!username || !password) return res.status(400).json({ error: "username and password are required" });
		if (usersRepo.findByUsername(username)) return res.status(409).json({ error: "Username already exists" });
		const user = usersRepo.create({ username, passwordHash: await hashPassword(password), isAdmin: !!isAdmin });
		res.status(201).json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
	});

	return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server/routes/adminRoutes.test.js`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/routes/adminRoutes.js server/routes/adminRoutes.test.js
git commit -m "feat: add admin user management routes"
```

---

### Task 15: Wire the server together, remove legacy files

**Files:**
- Create: `server/index.js`
- Delete: `app.js`, `lib/arbox.js`, `lib/push-notification.js`, `data/config.js`, `data/schedule.js.sample`

- [ ] **Step 1: Delete legacy files**

```bash
git rm app.js lib/arbox.js lib/push-notification.js data/config.js data/schedule.js.sample
rmdir lib data 2>/dev/null || true
```

- [ ] **Step 2: Write `server/index.js`**

```js
import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDb } from "./db/index.js";
import { createUsersRepo } from "./repositories/usersRepo.js";
import { createCredentialsRepo } from "./repositories/credentialsRepo.js";
import { createWebhookRepo } from "./repositories/webhookRepo.js";
import { createJobsRepo } from "./repositories/jobsRepo.js";
import { bootstrapAdmin } from "./auth/bootstrapAdmin.js";
import { requireAuth, requireAdmin } from "./auth/middleware.js";
import { createArboxClient } from "./arbox/client.js";
import { createJobScheduler } from "./scheduling/engine.js";
import { createNotifier } from "./notifications/sendWebhook.js";

import { createAuthRoutes } from "./routes/authRoutes.js";
import { createCredentialsRoutes } from "./routes/credentialsRoutes.js";
import { createWebhookRoutes } from "./routes/webhookRoutes.js";
import { createScheduleRoutes } from "./routes/scheduleRoutes.js";
import { createJobsRoutes } from "./routes/jobsRoutes.js";
import { createAdminRoutes } from "./routes/adminRoutes.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
const MAX_CLASSES_PER_MONTH = Number(process.env.MAX_CLASSES_PER_MONTH || 12);

if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");
if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY env var is required");

const db = createDb(DB_PATH);
const usersRepo = createUsersRepo(db);
const credentialsRepo = createCredentialsRepo(db, ENCRYPTION_KEY);
const webhookRepo = createWebhookRepo(db);
const jobsRepo = createJobsRepo(db);

await bootstrapAdmin({ usersRepo, username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });

const arboxClient = createArboxClient();
const notify = createNotifier({ webhookRepo });
const scheduler = createJobScheduler({ jobsRepo, credentialsRepo, arboxClient, notify });
scheduler.boot();

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(cookieParser());

app.use("/api", createAuthRoutes({ usersRepo, jwtSecret: JWT_SECRET }));

const authed = express.Router();
authed.use(requireAuth({ jwtSecret: JWT_SECRET }));
authed.use("/me/arbox-credentials", createCredentialsRoutes({ credentialsRepo }));
authed.use("/me/webhook", createWebhookRoutes({ webhookRepo }));
authed.use("/schedule", createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, maxClassesPerMonth: MAX_CLASSES_PER_MONTH }));
authed.use("/jobs", createJobsRoutes({ jobsRepo, credentialsRepo, arboxClient, scheduler }));
authed.use("/admin/users", requireAdmin, createAdminRoutes({ usersRepo }));
app.use("/api", authed);

app.get("/api/health", (req, res) => res.json({ status: "OK", uptime: process.uptime() }));

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
```

- [ ] **Step 3: Run the full backend test suite**

Run: `source ~/.nvm/nvm.sh && nvm use 18 && node --test server`
Expected: all tests across every prior task pass (roughly 45+ tests).

- [ ] **Step 4: Manual smoke test**

```bash
mkdir -p data
JWT_SECRET=devsecret ENCRYPTION_KEY=devkey ADMIN_USERNAME=admin ADMIN_PASSWORD=adminpw \
  ARBOX_WHITELABEL=hypr-training ARBOX_BOX_ID=59 ARBOX_LOCATIONS_BOX_ID=48 \
  node server/index.js
```

In another terminal: `curl -i http://localhost:5000/api/health` should return `200 {"status":"OK",...}`. `curl -i -X POST http://localhost:5000/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"adminpw"}'` should return `200` with a `Set-Cookie: session=...` header. Stop the server (Ctrl-C).

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: wire server entrypoint, remove legacy single-user app files"
```

---

### Task 16: Frontend (React/Vite)

**Files:**
- Create: `client/package.json`, `client/vite.config.js`, `client/index.html`
- Create: `client/src/main.jsx`, `client/src/App.jsx`, `client/src/api.js`, `client/src/styles.css`
- Create: `client/src/pages/LoginPage.jsx`, `client/src/pages/SchedulePage.jsx`, `client/src/pages/SettingsPage.jsx`, `client/src/pages/AdminUsersPage.jsx`
- Create: `client/src/components/DayTabs.jsx`, `client/src/components/ClassRow.jsx`, `client/src/components/QuotaStrip.jsx`

- [ ] **Step 1: Scaffold the Vite project config**

`client/package.json`:

```json
{
	"name": "auto-enroll-arbox-client",
	"private": true,
	"version": "1.0.0",
	"type": "module",
	"scripts": {
		"dev": "vite",
		"build": "vite build"
	},
	"dependencies": {
		"react": "^18.3.1",
		"react-dom": "^18.3.1",
		"react-router-dom": "^6.26.0"
	},
	"devDependencies": {
		"@vitejs/plugin-react": "^4.3.1",
		"vite": "^5.4.0"
	}
}
```

`client/vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			"/api": "http://localhost:5000",
		},
	},
});
```

`client/index.html`:

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
		<title>Arbox Auto-Enroll</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/src/main.jsx"></script>
	</body>
</html>
```

- [ ] **Step 2: Write `client/src/api.js`**

```js
const BASE = "/api";

async function request(path, options = {}) {
	const res = await fetch(`${BASE}${path}`, {
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		...options,
	});
	if (res.status === 401) {
		window.location.href = "/login";
		throw new Error("Not authenticated");
	}
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `Request failed: ${res.status}`);
	}
	if (res.status === 204) return null;
	return res.json();
}

export const api = {
	login: (username, password) => request("/login", { method: "POST", body: JSON.stringify({ username, password }) }),
	logout: () => request("/logout", { method: "POST" }),
	getSchedule: (days = 7) => request(`/schedule?days=${days}`),
	getCredentials: () => request("/me/arbox-credentials"),
	setCredentials: (email, password) => request("/me/arbox-credentials", { method: "PUT", body: JSON.stringify({ email, password }) }),
	getWebhook: () => request("/me/webhook"),
	setWebhook: (webhookUrl) => request("/me/webhook", { method: "PUT", body: JSON.stringify({ webhookUrl }) }),
	scheduleJob: (scheduleId, classDate) => request("/jobs", { method: "POST", body: JSON.stringify({ scheduleId, classDate }) }),
	cancelJob: (id) => request(`/jobs/${id}`, { method: "DELETE" }),
	listUsers: () => request("/admin/users"),
	createUser: (username, password, isAdmin) => request("/admin/users", { method: "POST", body: JSON.stringify({ username, password, isAdmin }) }),
};
```

- [ ] **Step 3: Write `client/src/components/QuotaStrip.jsx`**

```jsx
export function QuotaStrip({ used, limit }) {
	return (
		<div className="quota-strip">
			Quota: {used}/{limit} sessions used this month
		</div>
	);
}
```

- [ ] **Step 4: Write `client/src/components/ClassRow.jsx`**

```jsx
function formatCountdown(fireAtIso) {
	const diffMs = new Date(fireAtIso).getTime() - Date.now();
	if (diffMs <= 0) return "registration open now";
	const hours = Math.floor(diffMs / 3600000);
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	const minutes = Math.floor((diffMs % 3600000) / 60000);
	if (days > 0) return `opens in ${days}d ${remHours}h`;
	if (hours > 0) return `opens in ${hours}h ${minutes}m`;
	return `opens in ${minutes}m`;
}

export function ClassRow({ classInfo, onSchedule, onCancel }) {
	const full = classInfo.bookedCount >= classInfo.maxUsers;
	return (
		<div className="class-row">
			<div className="class-row-main">
				<div className="class-row-time">{classInfo.time}</div>
				<div className="class-row-name">{classInfo.name}</div>
				<div className="class-row-meta">
					{classInfo.coach || "—"} · {classInfo.bookedCount}/{classInfo.maxUsers} {full ? "(full)" : ""}
				</div>
				<div className={`class-row-status ${classInfo.alreadyScheduled ? "status-scheduled" : ""}`}>
					{classInfo.alreadyScheduled ? `✓ ${classInfo.jobStatus}` : formatCountdown(classInfo.fireAt)}
				</div>
			</div>
			{classInfo.alreadyScheduled ? (
				<button className="btn btn-secondary" onClick={() => onCancel(classInfo.jobId)}>
					Cancel
				</button>
			) : (
				<button className="btn btn-primary" onClick={() => onSchedule(classInfo)}>
					Schedule
				</button>
			)}
		</div>
	);
}
```

- [ ] **Step 5: Write `client/src/components/DayTabs.jsx`**

```jsx
export function DayTabs({ days, selectedDate, onSelect }) {
	return (
		<div className="day-tabs">
			{days.map((d) => (
				<button
					key={d.date}
					className={`day-tab ${d.date === selectedDate ? "day-tab-active" : ""}`}
					onClick={() => onSelect(d.date)}
				>
					{d.label}
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 6: Write `client/src/pages/SchedulePage.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { DayTabs } from "../components/DayTabs.jsx";
import { ClassRow } from "../components/ClassRow.jsx";
import { QuotaStrip } from "../components/QuotaStrip.jsx";

function dayLabel(dateStr) {
	const d = new Date(`${dateStr}T00:00:00`);
	return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

export function SchedulePage() {
	const [classes, setClasses] = useState([]);
	const [quota, setQuota] = useState({ used: 0, limit: 0 });
	const [selectedDate, setSelectedDate] = useState(null);
	const [error, setError] = useState(null);
	const [loading, setLoading] = useState(true);

	async function load() {
		setLoading(true);
		setError(null);
		try {
			const data = await api.getSchedule(7);
			setClasses(data.classes);
			setQuota(data.quota);
			if (!selectedDate && data.classes.length > 0) setSelectedDate(data.classes[0].date);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, []);

	const days = useMemo(() => {
		const uniqueDates = [...new Set(classes.map((c) => c.date))].sort();
		return uniqueDates.map((date) => ({ date, label: dayLabel(date) }));
	}, [classes]);

	const visibleClasses = classes.filter((c) => c.date === selectedDate);

	async function handleSchedule(classInfo) {
		try {
			await api.scheduleJob(classInfo.id, classInfo.date);
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	async function handleCancel(jobId) {
		try {
			await api.cancelJob(jobId);
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	if (loading) return <p className="page-status">Loading schedule…</p>;
	if (error) return <p className="page-status page-error">{error}</p>;

	return (
		<div className="schedule-page">
			<QuotaStrip used={quota.used} limit={quota.limit} />
			<DayTabs days={days} selectedDate={selectedDate} onSelect={setSelectedDate} />
			<div className="class-list">
				{visibleClasses.map((c) => (
					<ClassRow key={c.id} classInfo={c} onSchedule={handleSchedule} onCancel={handleCancel} />
				))}
				{visibleClasses.length === 0 && <p className="page-status">No classes this day.</p>}
			</div>
		</div>
	);
}
```

- [ ] **Step 7: Write `client/src/pages/LoginPage.jsx`**

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export function LoginPage() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);
	const navigate = useNavigate();

	async function handleSubmit(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.login(username, password);
			navigate("/");
		} catch (err) {
			setError(err.message);
		}
	}

	return (
		<form className="login-form" onSubmit={handleSubmit}>
			<h1>Arbox Auto-Enroll</h1>
			<input className="mock-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
			<input
				className="mock-input"
				type="password"
				placeholder="Password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			{error && <p className="page-error">{error}</p>}
			<button className="btn btn-primary" type="submit">
				Log in
			</button>
		</form>
	);
}
```

- [ ] **Step 8: Write `client/src/pages/SettingsPage.jsx`**

```jsx
import { useEffect, useState } from "react";
import { api } from "../api.js";

export function SettingsPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [webhookUrl, setWebhookUrl] = useState("");
	const [status, setStatus] = useState(null);

	useEffect(() => {
		api.getCredentials().then((c) => setEmail(c.email || ""));
		api.getWebhook().then((w) => setWebhookUrl(w.webhookUrl || ""));
	}, []);

	async function saveCredentials(e) {
		e.preventDefault();
		try {
			await api.setCredentials(email, password);
			setPassword("");
			setStatus("Gym credentials saved.");
		} catch (err) {
			setStatus(err.message);
		}
	}

	async function saveWebhook(e) {
		e.preventDefault();
		try {
			await api.setWebhook(webhookUrl);
			setStatus("Webhook saved.");
		} catch (err) {
			setStatus(err.message);
		}
	}

	return (
		<div className="settings-page">
			<h2>Gym credentials</h2>
			<form onSubmit={saveCredentials}>
				<input className="mock-input" placeholder="Arbox email" value={email} onChange={(e) => setEmail(e.target.value)} />
				<input
					className="mock-input"
					type="password"
					placeholder="Arbox password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<button className="btn btn-primary" type="submit">
					Save
				</button>
			</form>

			<h2>Webhook</h2>
			<form onSubmit={saveWebhook}>
				<input
					className="mock-input"
					placeholder="https://your-webhook-url"
					value={webhookUrl}
					onChange={(e) => setWebhookUrl(e.target.value)}
				/>
				<button className="btn btn-primary" type="submit">
					Save
				</button>
			</form>

			{status && <p className="page-status">{status}</p>}
		</div>
	);
}
```

- [ ] **Step 9: Write `client/src/pages/AdminUsersPage.jsx`**

```jsx
import { useEffect, useState } from "react";
import { api } from "../api.js";

export function AdminUsersPage() {
	const [users, setUsers] = useState([]);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);

	function load() {
		api.listUsers().then(setUsers);
	}

	useEffect(load, []);

	async function handleCreate(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.createUser(username, password, false);
			setUsername("");
			setPassword("");
			load();
		} catch (err) {
			setError(err.message);
		}
	}

	return (
		<div className="admin-users-page">
			<h2>Users</h2>
			<ul>
				{users.map((u) => (
					<li key={u.id}>
						{u.username} {u.is_admin ? "(admin)" : ""}
					</li>
				))}
			</ul>
			<h3>Add user</h3>
			<form onSubmit={handleCreate}>
				<input className="mock-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
				<input
					className="mock-input"
					type="password"
					placeholder="Temporary password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<button className="btn btn-primary" type="submit">
					Create
				</button>
			</form>
			{error && <p className="page-error">{error}</p>}
		</div>
	);
}
```

- [ ] **Step 10: Write `client/src/App.jsx`**

```jsx
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { LoginPage } from "./pages/LoginPage.jsx";
import { SchedulePage } from "./pages/SchedulePage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { AdminUsersPage } from "./pages/AdminUsersPage.jsx";

function Nav({ onLogout }) {
	return (
		<nav className="app-nav">
			<Link to="/">Schedule</Link>
			<Link to="/settings">Settings</Link>
			<Link to="/admin">Users</Link>
			<button className="btn-link" onClick={onLogout}>
				Log out
			</button>
		</nav>
	);
}

function AppShell() {
	const navigate = useNavigate();

	async function handleLogout() {
		await api.logout();
		navigate("/login");
	}

	return (
		<>
			<Nav onLogout={handleLogout} />
			<main className="app-main">
				<Routes>
					<Route path="/" element={<SchedulePage />} />
					<Route path="/settings" element={<SettingsPage />} />
					<Route path="/admin" element={<AdminUsersPage />} />
				</Routes>
			</main>
		</>
	);
}

export function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/*" element={<AppShell />} />
			</Routes>
		</BrowserRouter>
	);
}
```

- [ ] **Step 11: Write `client/src/main.jsx`**

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);
```

- [ ] **Step 12: Write `client/src/styles.css`** (mobile-first)

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #0e0e10; color: #eee; }
.app-nav { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #2a2a2e; align-items: center; }
.app-nav a { color: #eee; text-decoration: none; font-size: 14px; }
.app-main { padding: 12px 16px 80px; max-width: 480px; margin: 0 auto; }
.btn { border: none; border-radius: 8px; padding: 8px 14px; font-size: 14px; cursor: pointer; }
.btn-primary { background: #3ab0f2; color: #041; }
.btn-secondary { background: #444; color: #eee; }
.btn-link { background: none; border: none; color: #3ab0f2; margin-left: auto; cursor: pointer; }
.mock-input { display: block; width: 100%; margin-bottom: 8px; padding: 10px; border-radius: 8px; border: 1px solid #333; background: #1a1a1d; color: #eee; }
.quota-strip { font-size: 12px; opacity: 0.7; margin-bottom: 10px; }
.day-tabs { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 12px; }
.day-tab { flex: 0 0 auto; padding: 8px 12px; border-radius: 20px; border: 1px solid #333; background: #1a1a1d; color: #eee; }
.day-tab-active { background: #3ab0f2; color: #041; border-color: #3ab0f2; }
.class-list { display: flex; flex-direction: column; gap: 8px; }
.class-row { display: flex; justify-content: space-between; align-items: center; border: 1px solid #2a2a2e; border-radius: 10px; padding: 10px 12px; }
.class-row-time { font-weight: bold; }
.class-row-meta { font-size: 12px; opacity: 0.7; }
.class-row-status { font-size: 12px; color: #e0a000; margin-top: 4px; }
.status-scheduled { color: #3ab04a; }
.page-status { text-align: center; opacity: 0.7; margin-top: 40px; }
.page-error { color: #e05050; }
.login-form { display: flex; flex-direction: column; gap: 8px; max-width: 320px; margin: 80px auto; padding: 0 16px; }
```

- [ ] **Step 13: Install and build the frontend**

Run:

```bash
cd client
npm install
npm run build
cd ..
```

Expected: `client/dist/index.html` and bundled JS/CSS assets exist.

- [ ] **Step 14: Manual verification**

With the backend running (Task 15, Step 4) and `npm run dev` in `client/` pointed at it via the Vite proxy, open `http://localhost:5173`, log in with the admin credentials, confirm the login form works and redirects. Full schedule-rendering verification happens in Task 18 once real Arbox credentials are wired through the UI.

- [ ] **Step 15: Commit**

```bash
cd client && echo "dist/\nnode_modules/" > .gitignore && cd ..
git add client
git commit -m "feat: add React/Vite mobile-first frontend (login, schedule, settings, admin)"
```

---

### Task 17: Docker

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Modify: `sample.env`

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
FROM node:18-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:18-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/app.db
EXPOSE 5000
CMD ["node", "server/index.js"]
```

- [ ] **Step 2: Write `.dockerignore`**

```
node_modules
client/node_modules
client/dist
data
.env
.git
.superpowers
docs
```

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - app-data:/app/data
    environment:
      PORT: "5000"
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      ARBOX_WHITELABEL: ${ARBOX_WHITELABEL:-hypr-training}
      ARBOX_BOX_ID: ${ARBOX_BOX_ID:-59}
      ARBOX_LOCATIONS_BOX_ID: ${ARBOX_LOCATIONS_BOX_ID:-48}
      MAX_CLASSES_PER_MONTH: ${MAX_CLASSES_PER_MONTH:-12}
      NODE_ENV: production

volumes:
  app-data:
```

- [ ] **Step 4: Update `sample.env`**

```
JWT_SECRET=""
ENCRYPTION_KEY=""
ADMIN_USERNAME=""
ADMIN_PASSWORD=""
ARBOX_WHITELABEL="hypr-training"
ARBOX_BOX_ID="59"
ARBOX_LOCATIONS_BOX_ID="48"
MAX_CLASSES_PER_MONTH="12"
```

- [ ] **Step 5: Build and run the container**

```bash
docker compose build
docker compose up -d
docker compose logs -f app
```

Expected: logs show `Server listening on :5000` with no errors. `curl -i http://localhost:5000/api/health` returns `200`.

- [ ] **Step 6: Verify durability — restart survives**

```bash
docker compose restart app
docker compose logs app | tail -20
```

Expected: no errors on restart; the app re-runs migrations (no-op, already applied) and re-arms any pending jobs.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore sample.env
git commit -m "feat: add Docker/docker-compose deployment"
```

---

### Task 18: End-to-end manual verification against the real Arbox API

This mirrors the validation already performed manually in the prior session, now exercised through the full app instead of ad-hoc scripts.

**Files:** none (manual QA task).

- [ ] **Step 1: Start the stack**

`docker compose up -d`, confirm `/api/health` is 200.

- [ ] **Step 2: Log in as admin**

Open the app in a browser (`http://localhost:5000`), log in with `ADMIN_USERNAME`/`ADMIN_PASSWORD`.

- [ ] **Step 3: Create the friend's account**

Go to Users (admin page), create an account for your friend with a temporary password. Confirm it appears in the list.

- [ ] **Step 4: Set your own Arbox credentials**

Go to Settings, enter your real Arbox email/password, save. Confirm the GET afterward shows `hasPassword: true` and never echoes the password.

- [ ] **Step 5: Verify the schedule view**

Go to the Schedule page. Confirm real classes for the next 7 days render, grouped by day-tabs, each showing coach/spots/countdown-to-registration-open matching what you see in the Arbox app itself.

- [ ] **Step 6: Schedule a real class and let it fire**

Pick a class whose registration window opens within the next few minutes (or temporarily lower `enable_registration_time`-driven `fire_at` for a test row directly in the DB if none is conveniently timed — acceptable for this one-off verification). Press Schedule. Confirm the row flips to "✓ scheduled" with a countdown. Wait for it to fire; confirm status becomes `success` (or `waitlisted`) and a webhook POST arrives if `webhookUrl` is configured (use a temporary endpoint like `https://webhook.site` for the test if Home Assistant isn't reachable during testing).

- [ ] **Step 7: Cancel a booking**

Press Cancel on the now-`success` job. Confirm it calls Arbox's cancel endpoint and the class shows freed-up capacity again in a fresh schedule load — same verification approach as the prior session's manual `scheduleUser/delete` test.

- [ ] **Step 8: Verify restart durability**

Schedule a class whose `fire_at` is a few minutes out. `docker compose restart app` before it fires. Confirm after restart the job is still `pending` and still fires at the correct time (check container logs for the re-arm).

- [ ] **Step 9: Verify missed-job handling**

Schedule a class, then stop the container (`docker compose stop app`) until past its `fire_at`, then start it again (`docker compose start app`). Confirm the job flips to `missed` on boot and (if configured) a webhook notification with `event: "missed"` arrives — and confirm no late enrollment attempt was made.

- [ ] **Step 10: Confirm friend isolation**

Log in as the friend account, set different (or the same) Arbox credentials, confirm their schedule/jobs view is independent of the admin's — scheduling or cancelling on one account does not affect the other's job list.

---

## Plan self-review notes

- **Spec coverage:** every section of the design doc maps to a task — data model (Task 2), encrypted credentials (Task 3, 7, 9), admin bootstrap (Task 8), live schedule + `enable_registration_time` (Task 4, 6, 10), scheduling engine with durability/retry/burst semantics (Task 11), cancellation (Task 12), webhooks (Task 13), admin user management (Task 14), day-tabs mobile UI (Task 16), single-container Docker deployment (Task 17), and the real-API verification the spec's "Testing approach" section calls for (Task 18).
- **No placeholders:** every step has complete, runnable code; no "add error handling here" stubs.
- **Type/name consistency checked:** `computeFireAt(date, time, hours)` signature used identically in Tasks 4, 10, 12; `classifyEnrollResponse(status, body)` used identically in Tasks 5, 11; repository method names (`findByIdUnscoped`, `findById(id, userId)`, `listPending`, `findActiveByUserAndScheduleIds`, `updateStatus`) are consistent between Task 7's definitions and every later consumer (Tasks 10, 11, 12).
