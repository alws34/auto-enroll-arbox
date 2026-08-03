// One-off exploration tool — NOT part of the app.
//
// Purpose: dump the raw Arbox class object for a specific day/time so we can
// see every field Arbox actually returns (the app currently only reads a
// handful of them in server/routes/scheduleRoutes.js). We're hunting for
// whatever field carries the "WOD" content shown in the Arbox mobile app's
// "See WOD" screen, which isn't rendered by this box's web widget.
//
// Run it LOCALLY, on your own machine — never paste your Arbox password into
// chat. It only talks to Arbox's API (apiappv2.arboxapp.com), same as the
// app itself.
//
// Usage:
//   ARBOX_EMAIL="you@example.com" ARBOX_PASSWORD="..." \
//   ARBOX_DATE="2026-08-03" \
//   node scripts/debug-dump-schedule.js
//
// Optional env vars (defaults match this box's current .env):
//   ARBOX_WHITELABEL (default hypr-training)
//   ARBOX_BOX_ID (default 59)
//   ARBOX_LOCATIONS_BOX_ID (default 48)
//   ARBOX_NAME_FILTER (default "PUMP") — substring match on class name, to
//     narrow down to the one class you already confirmed has a WOD attached.

const BASE_URL = "https://apiappv2.arboxapp.com";
const WHITELABEL = process.env.ARBOX_WHITELABEL || "hypr-training";
const BOX_ID = Number(process.env.ARBOX_BOX_ID || 59);
const LOCATIONS_BOX_ID = Number(process.env.ARBOX_LOCATIONS_BOX_ID || 48);
const DATE = process.env.ARBOX_DATE || new Date().toISOString().slice(0, 10);
const NAME_FILTER = process.env.ARBOX_NAME_FILTER || "";

function authHeaders(token, refreshToken) {
	return {
		Accept: "application/json, text/plain, */*",
		"Content-Type": "application/json",
		whitelabel: WHITELABEL,
		// The mobile app (which is where the WOD feature lives) sends these
		// two extra headers on every request per community reverse-engineering
		// of this API. Some routes may only exist/respond for "app" clients.
		version: "11",
		referername: "app",
		...(token ? { accesstoken: token } : {}),
		...(refreshToken ? { refreshtoken: refreshToken } : {}),
	};
}

async function main() {
	const email = process.env.ARBOX_EMAIL;
	const password = process.env.ARBOX_PASSWORD;
	if (!email || !password) {
		console.error("Set ARBOX_EMAIL and ARBOX_PASSWORD env vars (see comment at top of this file).");
		process.exit(1);
	}

	console.error(`Logging in as ${email}...`);
	const loginRes = await fetch(`${BASE_URL}/api/v2/user/login`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({ email, password }),
	});
	const loginBody = await loginRes.json();
	if (loginRes.status !== 200) {
		console.error("Login failed:", JSON.stringify(loginBody, null, 2));
		process.exit(1);
	}
	const { token, refreshToken } = loginBody.data;
	console.error("Logged in OK.\n");

	const from = `${DATE}T00:00:00.000Z`;
	const to = `${DATE}T00:00:00.000Z`;
	console.error(`Fetching schedule for ${DATE}...`);
	const schedRes = await fetch(`${BASE_URL}/api/v2/schedule/betweenDates`, {
		method: "POST",
		headers: authHeaders(token, refreshToken),
		body: JSON.stringify({ from, locations_box_id: LOCATIONS_BOX_ID, to, boxes_id: BOX_ID }),
	});
	const schedBody = await schedRes.json();
	if (schedRes.status !== 200) {
		console.error("Schedule fetch failed:", JSON.stringify(schedBody, null, 2));
		process.exit(1);
	}
	const classes = schedBody.data || [];
	console.error(`Got ${classes.length} classes for ${DATE}.`);

	const matches = NAME_FILTER
		? classes.filter((c) => (c.box_categories?.name || "").includes(NAME_FILTER))
		: classes;

	if (matches.length === 0) {
		console.error(`No classes matched filter "${NAME_FILTER}". All class names seen:`);
		console.error([...new Set(classes.map((c) => c.box_categories?.name))].join(", "));
		process.exit(1);
	}

	console.error(`\n=== RAW class object(s) matching "${NAME_FILTER}" (${matches.length}) ===\n`);
	console.log(JSON.stringify(matches, null, 2));

	// Also try a handful of plausible dedicated WOD endpoints for the first
	// match, in case the content isn't embedded in the schedule object at
	// all. These are guesses — some will 404, that's expected and fine.
	const scheduleId = matches[0].id;
	const workoutId = matches[0].workout_id;
	const candidates = [
		...(workoutId
			? [
					`/api/v2/workout/${workoutId}`,
					`/api/v2/workouts/${workoutId}`,
					`/api/v2/wod/${workoutId}`,
					`/api/v2/wods/${workoutId}`,
					`/api/v2/user/workout/${workoutId}`,
					`/api/v2/user/wod/${workoutId}`,
					`/api/v2/boxes/${BOX_ID}/workout/${workoutId}`,
					`/api/v2/boxes/${BOX_ID}/workouts/${workoutId}`,
					`/api/v2/boxes/${BOX_ID}/wod/${workoutId}`,
					`/api/v2/workout/${workoutId}/results`,
					`/api/v2/logbook/${workoutId}`,
					`/api/v2/logBook/${workoutId}`,
					`/api/v2/workoutResults/${workoutId}`,
					`/api/v2/wodResults/${workoutId}`,
					`/api/v2/workout?id=${workoutId}`,
					`/api/v2/workout?workout_id=${workoutId}`,
					`/api/v1/workout/${workoutId}`,
					`/api/v3/workout/${workoutId}`,
					`/api/v2/movements/workout/${workoutId}`,
			  ]
			: []),
		`/api/v2/schedule/${scheduleId}/wod`,
		`/api/v2/schedule/${scheduleId}/logbook`,
		`/api/v2/scheduleLogBook/${scheduleId}`,
		`/api/v2/schedule/logbook?schedule_id=${scheduleId}`,
		`/api/v2/wod/${scheduleId}`,
		`/api/v2/wod?schedule_id=${scheduleId}`,
		`/api/v2/scheduleWod/${scheduleId}`,
		`/api/v2/boxWod?schedule_id=${scheduleId}&boxes_id=${BOX_ID}`,
		`/api/v2/workout/${scheduleId}`,
		`/api/v2/schedule/${scheduleId}`,
	];
	console.error(`\n=== Probing candidate WOD endpoints for schedule id ${scheduleId}, workout id ${workoutId} (host: ${BASE_URL}) ===`);
	for (const path of candidates) {
		try {
			const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders(token, refreshToken) });
			const text = await res.text();
			console.error(`\n--- ${path} -> HTTP ${res.status} ---`);
			console.error(text.slice(0, 2000));
		} catch (err) {
			console.error(`\n--- ${path} -> ERROR: ${err.message} ---`);
		}
	}

	// Two routes above came back 500 (not 404) — they exist, they're just
	// missing/wrong params: GET /api/v2/schedule/logbook and
	// GET /api/v2/schedule/{id}. Try them with fuller param sets and as POST.
	async function tryReq(label, method, path, { body, extraHeaders } = {}) {
		try {
			const res = await fetch(`${BASE_URL}${path}`, {
				method,
				headers: { ...authHeaders(token, refreshToken), ...(extraHeaders || {}) },
				...(body ? { body: JSON.stringify(body) } : {}),
			});
			const text = await res.text();
			console.error(
				`\n--- [${label}] ${method} ${path}${body ? " body=" + JSON.stringify(body) : ""}${
					extraHeaders ? " headers+=" + JSON.stringify(extraHeaders) : ""
				} -> HTTP ${res.status} ---`
			);
			console.error(text.slice(0, 3000));
		} catch (err) {
			console.error(`\n--- [${label}] ${method} ${path} -> ERROR: ${err.message} ---`);
		}
	}

	console.error(`\n=== Deep dive on the two live-but-500 routes ===`);
	const boxCtxHeaders = { boxFk: String(BOX_ID), whiteLabel: WHITELABEL, identifier: String(LOCATIONS_BOX_ID) };

	// Header-based context instead of query params
	await tryReq("H1", "GET", `/api/v2/schedule/logbook?schedule_id=${scheduleId}`, { extraHeaders: boxCtxHeaders });
	await tryReq("H2", "GET", `/api/v2/schedule/${scheduleId}`, { extraHeaders: boxCtxHeaders });

	// Maybe /schedule/logbook is a date-range list (like betweenDates) rather
	// than a single-schedule lookup — try it with from/to instead of an id.
	const dayFrom = `${DATE}T00:00:00.000Z`;
	const dayTo = `${DATE}T23:59:59.000Z`;
	await tryReq(
		"H3",
		"GET",
		`/api/v2/schedule/logbook?from=${encodeURIComponent(dayFrom)}&to=${encodeURIComponent(dayTo)}&boxes_id=${BOX_ID}&locations_box_id=${LOCATIONS_BOX_ID}`
	);
	await tryReq(
		"H4",
		"GET",
		`/api/v2/schedule/logbook?date=${DATE}&boxes_id=${BOX_ID}&locations_box_id=${LOCATIONS_BOX_ID}`
	);
	await tryReq("H5", "GET", `/api/v2/schedule/logbook?date=${DATE}`, { extraHeaders: boxCtxHeaders });

	// Maybe it wants the *series* id, not the one-off schedule occurrence id
	const seriesId = matches[0].series_fk;
	if (seriesId) {
		await tryReq("H6", "GET", `/api/v2/schedule/logbook?series_id=${seriesId}&boxes_id=${BOX_ID}&locations_box_id=${LOCATIONS_BOX_ID}`);
		await tryReq("H7", "GET", `/api/v2/schedule/${seriesId}?boxes_id=${BOX_ID}&locations_box_id=${LOCATIONS_BOX_ID}`);
	}
}

main();
