// Local-only tool — NOT part of the running app, NOT wired into server/index.js.
//
// Purpose: pull a real window of classes straight from Arbox (every class in
// the window, not just ones you've booked) and run them through the exact
// same production muscle-tagging logic the app uses
// (server/training/movementDictionary.js + categoryMuscleMap.js +
// coverage.js), then write a report of which ones the movement dictionary
// couldn't confidently tag. That's the practical way to find dictionary
// gaps before they surprise you in the app, and to sanity-check coverage
// across a whole week of real programming instead of one WOD at a time.
//
// Run it LOCALLY, on your own machine — never paste your Arbox password into
// chat. It only talks to Arbox's API, same as the app itself, and only
// reads (no bookings/cancellations).
//
// Usage:
//   ARBOX_EMAIL="you@example.com" ARBOX_PASSWORD='...' \
//   node scripts/coverage-audit.js
//
// Optional env vars:
//   ARBOX_FROM  (default: today, format YYYY-MM-DD)
//   ARBOX_DAYS  (default: 7)
//   ARBOX_WHITELABEL / ARBOX_BOX_ID / ARBOX_LOCATIONS_BOX_ID — only needed if
//     they differ from the defaults already baked into server/arbox/constants.js.
//
// Output: writes scripts/output/coverage-audit-<timestamp>.json (full report)
// and prints a summary to the console.

import { createArboxClient } from "../server/arbox/client.js";
import { computeMuscleCoverage } from "../server/training/coverage.js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
	const email = process.env.ARBOX_EMAIL;
	const password = process.env.ARBOX_PASSWORD;
	if (!email || !password) {
		console.error("Set ARBOX_EMAIL and ARBOX_PASSWORD env vars (see comment at top of this file).");
		process.exit(1);
	}

	const days = Number(process.env.ARBOX_DAYS || 7);
	const from = process.env.ARBOX_FROM ? new Date(`${process.env.ARBOX_FROM}T00:00:00.000Z`) : new Date();
	from.setUTCHours(0, 0, 0, 0);
	const to = new Date(from);
	to.setUTCDate(to.getUTCDate() + days);

	const client = createArboxClient();

	console.error(`Logging in as ${email}...`);
	const { token, refreshToken } = await client.login(email, password);
	console.error("Logged in OK.\n");

	console.error(`Fetching every class from ${from.toISOString().slice(0, 10)} for ${days} day(s)...`);
	const rawClasses = await client.getScheduleBetweenDates(token, refreshToken, from.toISOString(), to.toISOString());
	console.error(`Got ${rawClasses.length} classes.\n`);

	// Multiple sessions of the same class on the same day usually share one
	// workout_id — fetch each workout only once, then apply its text to every
	// class instance that references it.
	const uniqueWorkoutIds = [...new Set(rawClasses.map((c) => c.workout_id).filter(Boolean))];
	console.error(`Fetching WOD text for ${uniqueWorkoutIds.length} unique workout(s)...`);
	const textByWorkoutId = new Map();
	for (const workoutId of uniqueWorkoutIds) {
		try {
			const sections = await client.getWorkoutLogbook(token, refreshToken, workoutId);
			textByWorkoutId.set(workoutId, sections.map((s) => s.text).join("\n") || null);
		} catch (err) {
			console.error(`  workout ${workoutId}: fetch failed (${err.message}) — treating as no text`);
			textByWorkoutId.set(workoutId, null);
		}
	}

	const classes = rawClasses.map((c) => ({
		id: c.id,
		date: c.date,
		name: c.box_categories?.name?.trim(),
		workoutText: c.workout_id ? textByWorkoutId.get(c.workout_id) ?? null : null,
	}));

	const { totals, breakdown } = computeMuscleCoverage(classes);
	const needsReview = breakdown.filter((c) => c.needsReview);
	const withWod = breakdown.filter((c) => c.source === "wod");
	const categoryOnly = breakdown.filter((c) => c.source === "category" && !c.needsReview);

	console.error(`\n=== Summary ===`);
	console.error(`Total classes:            ${breakdown.length}`);
	console.error(`Tagged from WOD text:     ${withWod.length}`);
	console.error(`Tagged from class type:   ${categoryOnly.length}`);
	console.error(`NEEDS REVIEW (gaps):      ${needsReview.length}`);
	if (needsReview.length > 0) {
		console.error(`\nClasses that need a dictionary update:`);
		needsReview.forEach((c) => console.error(`  - [${c.date}] ${c.name} (id ${c.id})`));
	}

	const outDir = path.join(__dirname, "output");
	mkdirSync(outDir, { recursive: true });
	const outPath = path.join(outDir, `coverage-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
	writeFileSync(
		outPath,
		JSON.stringify(
			{
				from: from.toISOString().slice(0, 10),
				days,
				totals,
				summary: { total: breakdown.length, taggedFromWod: withWod.length, taggedFromCategory: categoryOnly.length, needsReview: needsReview.length },
				breakdown,
			},
			null,
			2
		)
	);
	console.error(`\nFull report written to ${outPath}`);
}

main().catch((err) => {
	console.error("Failed:", err);
	process.exit(1);
});
