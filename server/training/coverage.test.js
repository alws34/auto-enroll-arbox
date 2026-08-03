import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMuscleCoverage } from "./coverage.js";

test("a class with WOD text gets tagged from the movements in it, source 'wod'", () => {
	const { totals, breakdown } = computeMuscleCoverage([
		{ id: 1, date: "2026-08-04", name: "W.O.D Hall A", workoutText: "5 Rounds: 10 Deadlifts, 10 Pull-ups" },
	]);
	assert.equal(breakdown[0].source, "wod");
	assert.deepEqual(new Set(breakdown[0].muscleGroups), new Set(["lower-back", "hamstring", "gluteal", "upper-back", "biceps", "forearm"]));
	assert.equal(breakdown[0].needsReview, false);
	assert.equal(breakdown[0].workoutText, null); // only kept around for classes that need review
	assert.equal(totals["lower-back"], 1);
	assert.equal(totals.hamstring, 1);
	assert.equal(totals.gluteal, 1);
	assert.equal(totals.biceps, 1);
	assert.equal(totals.chest, 0);
});

test("a class with no WOD text falls back to the category guess, source 'category'", () => {
	const { totals, breakdown } = computeMuscleCoverage([{ id: 2, date: "2026-08-05", name: "Gymnastics Hall B", workoutText: null }]);
	assert.equal(breakdown[0].source, "category");
	assert.deepEqual(new Set(breakdown[0].muscleGroups), new Set(["abs", "front-deltoids", "biceps", "upper-back"]));
	assert.equal(totals.abs, 1);
});

test("a HYROX class with no WOD posted falls back to a legs/grip/cardio guess (found via a real-world audit, not left untagged)", () => {
	const { breakdown } = computeMuscleCoverage([{ id: 99, date: "2026-08-10", name: "HYROX", workoutText: null }]);
	assert.equal(breakdown[0].source, "category");
	assert.deepEqual(
		new Set(breakdown[0].muscleGroups),
		new Set(["quadriceps", "hamstring", "calves", "gluteal", "forearm", "abs", "front-deltoids", "upper-back", "trapezius"])
	);
});

test("a class whose WOD text matches no known movement also falls back to the category guess", () => {
	const { breakdown } = computeMuscleCoverage([
		{ id: 3, date: "2026-08-05", name: "PUMP Hall B", workoutText: "Coach's birthday, bring snacks" },
	]);
	assert.equal(breakdown[0].source, "category");
	assert.deepEqual(new Set(breakdown[0].muscleGroups), new Set(["chest", "upper-back", "front-deltoids", "biceps", "triceps"]));
});

test("a class with neither a matching WOD nor a recognized category contributes nothing, source 'none'", () => {
	const { totals, breakdown } = computeMuscleCoverage([{ id: 4, date: "2026-08-05", name: "Kids Club", workoutText: null }]);
	assert.equal(breakdown[0].source, "none");
	assert.deepEqual(breakdown[0].muscleGroups, []);
	Object.values(totals).forEach((v) => assert.equal(v, 0));
});

test("needsReview flags a real WOD our dictionary recognized nothing in — a dictionary gap, not a missing WOD", () => {
	const { breakdown } = computeMuscleCoverage([
		{ id: 5, date: "2026-08-05", name: "PUMP Hall B", workoutText: "Coach's birthday, bring snacks" },
		{ id: 6, date: "2026-08-06", name: "Gymnastics Hall B", workoutText: null },
	]);
	// Had text, but nothing in it matched a known movement — flagged, and the
	// raw text is kept around so the gap is actionable.
	assert.equal(breakdown[0].needsReview, true);
	assert.equal(breakdown[0].workoutText, "Coach's birthday, bring snacks");
	// No WOD was published at all — nothing to flag, this is expected/normal.
	assert.equal(breakdown[1].needsReview, false);
	assert.equal(breakdown[1].workoutText, null);
});

test("totals aggregate across the whole week, one count per class per group even if a movement repeats", () => {
	const { totals } = computeMuscleCoverage([
		{ id: 1, date: "2026-08-03", name: "W.O.D Hall A", workoutText: "Squat squat squat, then more squats" },
		{ id: 2, date: "2026-08-04", name: "W.O.D Hall A", workoutText: "Back squat 5x5" },
		{ id: 3, date: "2026-08-05", name: "Gymnastics Hall B", workoutText: null },
	]);
	assert.equal(totals.quadriceps, 2); // two classes touched quads, not four (repeated mentions don't inflate the count)
	assert.equal(totals.gluteal, 2);
	assert.equal(totals.abs, 3); // squats brace the core too, plus the gymnastics fallback
});

test("real-world gap scenario: a week with no leg-focused class shows zero across all leg-related groups", () => {
	const { totals } = computeMuscleCoverage([
		{ id: 1, date: "2026-08-03", name: "PUMP Hall B", workoutText: "Bench press 5x5, pull-ups 3x10" },
		{ id: 2, date: "2026-08-04", name: "Gymnastics Hall B", workoutText: null },
	]);
	assert.equal(totals.quadriceps, 0);
	assert.equal(totals.hamstring, 0);
	assert.equal(totals.gluteal, 0);
	assert.equal(totals.calves, 0);
});
