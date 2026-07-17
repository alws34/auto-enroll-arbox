# Multi-user Arbox auto-enroll web app — design

## Background

The existing project (`app.js` / `lib/arbox.js`) is a single-user Node/Express
service that logs into the Arbox API once a day at a fixed `registerTime` and
enrolls into classes read from a static `data/schedule.js` file. Core
functionality was validated against the real Arbox API for the
`hypr-training` (CrossFit White City) box — see prior session findings:

- Arbox requires a `whitelabel: hypr-training` header on every request (the
  old code never sent one — every call would have 403'd with `hasBrandedApp`).
- Correct `box_id = 59`, `locations_box_id = 48` (old hardcoded `80` was
  stale/wrong).
- `POST /api/v2/schedule/betweenDates` returns each class with an
  `enable_registration_time` field (48 or 72, in hours) — the exact
  advance-booking window for that specific class. This is authoritative and
  should be read live, never hardcoded.
- `POST /api/v2/scheduleUser/insert` (enroll) and
  `POST /api/v2/scheduleUser/delete` (cancel, body
  `{schedule_id, membership_user_id}`) both confirmed working end-to-end
  against a real class.

This spec replaces the single-user cron design with a multi-user, Dockerized
web app with a database, precise per-class scheduling, and a mobile-friendly
UI. n8n is dropped — this supersedes that idea entirely.

## Goals

- Two users (the author + a friend, same gym) each manage their own Arbox
  credentials and see/schedule their own classes independently.
- Browse the upcoming schedule in a daily view and press "Schedule" on any
  class; the app enrolls at the exact moment that class's registration window
  opens (`class_start - enable_registration_time` hours) — being first matters
  (a few seconds' difference is the difference between a spot and a waitlist).
- Survive restarts: scheduled jobs are durable and re-armed on boot.
- Per-user webhook notifications on job outcome.
- Runs as a single Docker container on the user's home server, reachable
  through a reverse proxy from the internet.

## Non-goals

- No public self-signup — accounts are admin-provisioned only.
- No support for other gyms/boxes — `hypr-training` (box 59 / locations_box
  48 / whitelabel `hypr-training`) is a fixed, shared, app-level constant, not
  per-user configuration (both users are members of the same gym).
- No coach-priority auto-pick — the UI shows individual class rows (specific
  coach, specific time), so the user picks the exact instance directly; the
  ambiguity that feature solved no longer exists.
- No latency-compensated early-fire scheduling — fire exactly at T, backed by
  a burst-retry window, is enough for v1.

## Architecture

**Stack:** Node/Express (ESM, building on the existing app skeleton) +
SQLite (`better-sqlite3`) for persistence + React/Vite for the frontend.
Single Docker container: a multi-stage Dockerfile builds the React app and
copies the static output into the Node image; Express serves both the static
frontend and the JSON API. One `docker-compose.yml` service, with a volume
for the SQLite file.

The app trusts `X-Forwarded-*` headers (deployed behind a reverse proxy such
as Caddy/Traefik/nginx-proxy-manager for TLS/public exposure — TLS itself is
out of scope for the app).

## Data model (SQLite)

```
users
  id INTEGER PRIMARY KEY
  username TEXT UNIQUE NOT NULL
  password_hash TEXT NOT NULL       -- bcrypt
  is_admin INTEGER NOT NULL DEFAULT 0
  created_at TEXT NOT NULL

arbox_credentials
  user_id INTEGER PRIMARY KEY REFERENCES users(id)
  email TEXT NOT NULL
  password_encrypted TEXT NOT NULL  -- AES-256-GCM, key from ENCRYPTION_KEY env
  updated_at TEXT NOT NULL

webhook_settings
  user_id INTEGER PRIMARY KEY REFERENCES users(id)
  webhook_url TEXT                  -- nullable; generic POST target (HA, or anything)

scheduled_jobs
  id INTEGER PRIMARY KEY
  user_id INTEGER NOT NULL REFERENCES users(id)
  schedule_id INTEGER NOT NULL      -- Arbox class id
  class_date TEXT NOT NULL
  class_time TEXT NOT NULL
  class_name TEXT NOT NULL
  enable_registration_time INTEGER NOT NULL  -- hours, snapshot at schedule-time
  fire_at TEXT NOT NULL             -- ISO timestamp, computed
  status TEXT NOT NULL              -- pending|fired|success|waitlisted|failed|missed|cancelled
  result_detail TEXT                -- free-form (error message, waitlist position, etc.)
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
```

Arbox gym credentials are stored encrypted (AES-256-GCM) because the app
needs the plaintext back to log into the Arbox API on the user's behalf —
this is encryption, not hashing. The key comes from an `ENCRYPTION_KEY`
environment variable (Docker secret / `.env`), never committed.

App login (`users.password_hash`) is bcrypt-hashed, standard practice —
the app never needs that plaintext back.

## Bootstrap / admin provisioning

No public signup page. On container boot, if the `users` table is empty, the
app reads `ADMIN_USERNAME` / `ADMIN_PASSWORD` from the environment and
creates that first admin account. The admin logs in and uses an in-app
"Manage Users" page (admin-only) to create the friend's account (set
username + temporary password; the friend can change it after first login).

## Scheduling engine

1. **Reading the schedule:** `GET /api/schedule?days=7` fetches live from
   Arbox using the caller's stored, decrypted credentials, for a rolling
   window (default 7 days, configurable). Each returned class already carries
   `enable_registration_time`; the API layer computes
   `fire_at = class_start_datetime - enable_registration_time hours` and
   annotates whether the current user already has a job for that
   `schedule_id`.

2. **Scheduling a class:** `POST /api/jobs { schedule_id }` — server
   re-resolves the class (to get authoritative `enable_registration_time`,
   date/time), inserts a `scheduled_jobs` row with `status = pending` and the
   computed `fire_at`, and arms an in-process timer for it.

3. **Timer precision:** the in-process scheduler holds pending jobs sorted by
   `fire_at`. For each job, it sets a coarse `setTimeout` firing ~150ms before
   `fire_at`, then switches to a tight poll loop (checking `Date.now()` on a
   short interval) to fire the actual enroll call at the exact target second —
   this avoids `setTimeout`'s drift under event-loop load.

4. **Firing:** at `fire_at`, the engine calls `POST
   /api/v2/scheduleUser/insert` using the user's live Arbox session
   (re-logging in shortly beforehand to ensure a fresh token). It burst-
   retries only on transient failures (network error, 5xx) every ~300ms for
   up to ~5s. A successful enrollment (booked or waitlisted — Arbox surfaces
   waitlist as an accepted outcome) stops the retry loop and marks the job
   `success` or `waitlisted`. A definitive business-rule rejection (e.g. the
   category-frequency-limit error seen during validation) stops retrying
   immediately and marks the job `failed` with the reason in
   `result_detail`.

5. **Durability across restarts:** on boot, the scheduler loads all
   `pending` jobs from SQLite. If `fire_at` is still in the future, it
   re-arms the timer as in step 3. If `fire_at` already passed while the
   container was down, the job is marked `missed` and a webhook notification
   is sent — the app never attempts a late signup, since the whole point is
   being first.

6. **Cancelling:** `DELETE /api/jobs/:id` — if the job hasn't fired yet, it's
   removed/marked `cancelled` and the timer is cleared. If it already
   succeeded (booked in Arbox), this instead calls Arbox's
   `scheduleUser/delete` to cancel the real booking.

## Notifications

Per-user, generic webhook URL (`webhook_settings.webhook_url`) — not tied to
Home Assistant specifically, any endpoint that accepts a POST works (Home
Assistant automation webhook, the old Alertzy-via-webhook-bridge, anything
else). On every terminal job state (`success`, `waitlisted`, `failed`,
`missed`) the engine POSTs JSON:

```json
{
  "event": "success|waitlisted|failed|missed",
  "user": "username",
  "class_name": "...",
  "date": "...",
  "time": "...",
  "detail": "..."
}
```

If no webhook URL is configured for a user, notification is silently
skipped.

## API surface

- `POST /api/login`, `POST /api/logout` — session-based auth
- `GET /api/me` — current user info
- `GET/PUT /api/me/arbox-credentials` — set/update gym email+password
- `GET/PUT /api/me/webhook` — set/update webhook URL
- `GET /api/schedule?days=7` — live schedule window, annotated with
  `fire_at`, `already_scheduled`, quota info (sessions used/left this month,
  from Arbox's membership/feed data — same source the old `pushReminders`
  used)
- `POST /api/jobs { schedule_id }` — schedule a class
- `DELETE /api/jobs/:id` — cancel a pending job, or cancel a real booking if
  already fired successfully
- `GET /api/jobs` — this user's jobs + status
- `GET/POST /api/admin/users` — admin-only, manage accounts

## Frontend (React/Vite)

Mobile-first. Screens:

- **Login** — username/password.
- **Schedule (home)** — day-tabs (chosen over a single continuous vertical
  agenda) so the user focuses on one day at a time; each class row shows
  time, name, coach, spots left, registration-window status ("opens in
  22h 14m" / "registration open now" / "✓ scheduled — fires in 1d 22h"), and
  a Schedule/Cancel button. A quota strip ("4/12 sessions used this month")
  sits above the list.
- **Settings** — edit gym credentials, edit webhook URL.
- **Manage Users** (admin only) — create/list accounts.

## Deployment

- Single `Dockerfile`, multi-stage: build the Vite frontend, copy `dist/`
  into the final Node image alongside the Express server.
- `docker-compose.yml`: one service, a named volume for the SQLite file, env
  vars for `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY`,
  `ARBOX_WHITELABEL`, `ARBOX_BOX_ID`, `ARBOX_LOCATIONS_BOX_ID`.
- App trusts `X-Forwarded-*` (reverse proxy handles TLS/public exposure).

## Testing approach

- Unit tests around the scheduling engine's `fire_at` computation, the
  timer arm/re-arm logic, and the retry/terminal-state classification
  (transient vs definitive Arbox errors) — these are the highest-risk,
  hardest-to-manually-verify parts.
- Manual verification against the real Arbox API (as already done in the
  validation session) for login, schedule fetch, enroll, and cancel — using
  a disposable/low-consequence real class, same as before.
