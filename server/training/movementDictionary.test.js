import { test } from "node:test";
import assert from "node:assert/strict";
import { findMuscleGroups, MUSCLE_GROUPS } from "./movementDictionary.js";

test("findMuscleGroups matches multiple movements in a real WOD and dedupes groups", () => {
	const text = "21-15-9\nThrusters\nPull-ups";
	const { groups, matchedMovements } = findMuscleGroups(text);
	assert.deepEqual(new Set(groups), new Set(["quadriceps", "gluteal", "front-deltoids", "triceps", "upper-back", "biceps", "forearm"]));
	assert.deepEqual(new Set(matchedMovements), new Set(["thruster", "pull-up"]));
});

test("findMuscleGroups matches whole words only — 'rowing' isn't caught by an unrelated substring", () => {
	const { groups } = findMuscleGroups("500m Row for time");
	assert.deepEqual(new Set(groups), new Set(["upper-back", "back-deltoids", "biceps", "abs", "forearm"]));
});

test("findMuscleGroups does not false-positive on unrelated text", () => {
	const { groups, matchedMovements } = findMuscleGroups("Coach's birthday party, bring snacks");
	assert.deepEqual(groups, []);
	assert.deepEqual(matchedMovements, []);
});

test("findMuscleGroups returns empty for null/empty text", () => {
	assert.deepEqual(findMuscleGroups(null).groups, []);
	assert.deepEqual(findMuscleGroups("").groups, []);
});

test("findMuscleGroups only ever returns groups from the known MUSCLE_GROUPS list", () => {
	const text = "Back Squat, Deadlift, Bench Press, Pull-ups, Sit-ups, Double Unders, Run, GHD, Farmer Carry";
	const { groups } = findMuscleGroups(text);
	groups.forEach((g) => assert.ok(MUSCLE_GROUPS.includes(g), `${g} should be a known muscle group`));
});

test("findMuscleGroups handles plurals and hyphen/space variants for the same movement", () => {
	assert.deepEqual(new Set(findMuscleGroups("3 squats").groups), new Set(["quadriceps", "gluteal", "abs"]));
	assert.deepEqual(new Set(findMuscleGroups("push-ups").groups), new Set(["chest", "triceps", "front-deltoids"]));
	assert.deepEqual(new Set(findMuscleGroups("push ups").groups), new Set(["chest", "triceps", "front-deltoids"]));
});

// Regression test for a real WOD the user reported as under-tagged: it only
// came back as gluteal/hamstring/lower-back because "Knees-to-Elbows" and
// "H.S Walk" weren't in the dictionary yet (only "American KB Swings"
// matched), missing the core/shoulder/grip/lat demand the workout's own
// stimulus notes call out explicitly.
test("findMuscleGroups fully tags a real HS-walk / knees-to-elbows / American KB swing WOD", () => {
	const text = `
		Metcon:
		18:00 AMRAP
		15m H.S Walk
		10 Knees-to-Elbows
		10 American KB Swings (32/24kg)
		15m H.S Walk
		20 Knees-to-Elbows
		20 American KB Swings
		15m H.S Walk
		25 Knees-to-Elbows
		25 American KB Swings
	`;
	const { groups, matchedMovements } = findMuscleGroups(text);
	assert.deepEqual(
		new Set(groups),
		new Set(["gluteal", "hamstring", "lower-back", "forearm", "front-deltoids", "abs", "upper-back", "triceps"])
	);
	assert.deepEqual(new Set(matchedMovements), new Set(["kb swing", "american kb swing", "knees-to-elbows", "handstand walk"]));
});

// Regression test for a second real WOD the user checked with Gemini: it
// correctly got 10 groups (all the leg/back/shoulder demand from rowing,
// biking, and squat cleans) but missed abs (core bracing under a loaded
// squat/catch, and during the rowing stroke) and forearm (grip through 100
// reps of cleans and holding the rower handle).
test("findMuscleGroups fully tags a real row/bike/squat-clean partner WOD", () => {
	const text = `
		Metcon
		30:00 Clock (with a partner)
		6 Total Rounds:
		500m Row / 1000m Bike
		- partners alternate efforts (3 each)
		Once the 6 rounds are complete, perform:
		100 Squat Cleans
		- One Person works at a time
	`;
	const { groups, matchedMovements } = findMuscleGroups(text);
	assert.deepEqual(
		new Set(groups),
		new Set([
			"quadriceps",
			"gluteal",
			"abs",
			"lower-back",
			"trapezius",
			"front-deltoids",
			"forearm",
			"upper-back",
			"back-deltoids",
			"biceps",
			"hamstring",
			"calves",
		])
	);
	assert.deepEqual(new Set(matchedMovements), new Set(["back squat", "clean", "row", "bike"]));
});

// Regression test for a third real WOD checked with Gemini: highly accurate
// except hamstrings were completely missing from both clean and snatch —
// they drive the hip-hinge/hip-extension pull off the floor right alongside
// the glutes and lower back, same as a deadlift or kb swing.
test("findMuscleGroups tags hamstrings for a power snatch + push-up WOD", () => {
	const text = `
		Strength:
		Every 2:00 x 5
		2 Touch & Go Power Snatch
		Metcon:
		10:00 AMRAP
		1-2-3-4-5..+1
		Power Snatch
		2-4-6-8-10..+2
		H.R Push-Ups
	`;
	const { groups, matchedMovements } = findMuscleGroups(text);
	assert.ok(groups.includes("hamstring"), "snatch should credit hamstrings for the hip-hinge pull");
	assert.deepEqual(
		new Set(groups),
		new Set(["lower-back", "hamstring", "quadriceps", "gluteal", "trapezius", "front-deltoids", "abs", "forearm", "chest", "triceps"])
	);
	assert.deepEqual(new Set(matchedMovements), new Set(["snatch", "push-up"]));
});

// Sweep against the full official CrossFit movements list
// (crossfit.com/crossfit-movements) to close gaps proactively rather than
// waiting for another real-world miss. Each of these was checked against the
// dictionary before this test was added and came back unmatched.
test("findMuscleGroups recognizes movements added in the full CrossFit-list sweep", () => {
	assert.deepEqual(new Set(findMuscleGroups("5 rounds of Turkish Get-ups").groups), new Set(["abs", "front-deltoids", "gluteal", "quadriceps"]));
	assert.deepEqual(new Set(findMuscleGroups("20 Wall Walks").groups), new Set(["front-deltoids", "triceps", "abs"]));
	assert.deepEqual(new Set(findMuscleGroups("Windshield Wipers x 15").groups), new Set(["abs", "obliques"]));
	assert.deepEqual(new Set(findMuscleGroups("Skin the Cat x 5").groups), new Set(["back-deltoids", "upper-back", "abs"]));
	assert.deepEqual(new Set(findMuscleGroups("L-sit hold 30s").groups), new Set(["abs", "front-deltoids"]));
	assert.deepEqual(new Set(findMuscleGroups("Slam Balls x 20").groups), new Set(["abs", "quadriceps", "front-deltoids"]));
	assert.deepEqual(new Set(findMuscleGroups("Good Mornings 3x8").groups), new Set(["hamstring", "gluteal", "lower-back"]));
	// Also matches the generic "press" keyword (adds triceps) since "Sots
	// Press" contains the word "press" — expected, not a bug.
	assert.deepEqual(new Set(findMuscleGroups("Sots Press 5x3").groups), new Set(["front-deltoids", "quadriceps", "triceps"]));
	assert.deepEqual(new Set(findMuscleGroups("50 Single-unders").groups), new Set(["calves"]));
	assert.deepEqual(new Set(findMuscleGroups("Pistols x 10 each leg").groups), new Set(["quadriceps", "gluteal", "abs"]));
	assert.deepEqual(new Set(findMuscleGroups("Strict Toes-to-rings x 10").groups), new Set(["abs", "forearm"]));
	// Plain static-hold handstand practice, no "walk" or "push-up" in the text.
	assert.deepEqual(new Set(findMuscleGroups("Handstand hold practice 5x30s").groups), new Set(["front-deltoids", "triceps", "abs"]));
});
