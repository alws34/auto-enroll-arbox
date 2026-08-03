import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMuscleCoverage } from "./coverage.js";

test("a class with WOD text gets tagged from the movements in it, source 'wod'", () => {
	const { totals, breakdown } = computeMuscleCoverage([
		{ id: 1, date: "2026-08-04", name: "W.O.D Hall A", workoutText: "5 Rounds: 10 Deadlifts, 10 Pull-ups" },
	]);
	assert.equal(breakdown[0].source, "wod");
	assert.deepEqual(new Set(breakdown[0].muscleGroups), new Set(["Back", "Hamstrings", "Glutes", "Arms"]));
	assert.equal(totals.Back, 1);
	assert.equal(totals.Hamstrings, 1);
	assert.equal(totals.Glutes, 1);
	assert.equal(totals.Arms, 1);
	assert.equal(totals.Chest, 0);
});

test("a class with no WOD text falls back to the category guess, source 'category'", () => {
	const { totals, breakdown } = computeMuscleCoverage([{ id: 2, date: "2026-08-05", name: "Gymnastics Hall B", workoutText: null }]);
	assert.equal(breakdown[0].source, "category");
	assert.deepEqual(new Set(breakdown[0].muscleGroups), new Set(["Core", "Shoulders", "Arms"]));
	assert.equal(totals.Core, 1);
});

test("a class whose WOD text matches no known movement also falls back to the category guess", () => {
	const { breakdown } = computeMuscleCoverage([
		{ id: 3, date: "2026-08-05", name: "PUMP Hall B", workoutText: "Coach's birthday, bring snacks" },
	]);
	assert.equal(breakdown[0].source, "category");
	assert.deepEqual(new Set(breakdown[0].muscleGroups), new Set(["Chest", "Back", "Shoulders", "Arms"]));
});

test("a class with neither a matching WOD nor a recognized category contributes nothing, source 'none'", () => {
	const { totals, breakdown } = computeMuscleCoverage([{ id: 4, date: "2026-08-05", name: "Kids Club", workoutText: null }]);
	assert.equal(breakdown[0].source, "none");
	assert.deepEqual(breakdown[0].muscleGroups, []);
	Object.values(totals).forEach((v) => assert.equal(v, 0));
});

test("totals aggregate across the whole week, one count per class per group even if a movement repeats", () => {
	const { totals } = computeMuscleCoverage([
		{ id: 1, date: "2026-08-03", name: "W.O.D Hall A", workoutText: "Squat squat squat, then more squats" },
		{ id: 2, date: "2026-08-04", name: "W.O.D Hall A", workoutText: "Back squat 5x5" },
		{ id: 3, date: "2026-08-05", name: "Gymnastics Hall B", workoutText: null },
	]);
	assert.equal(totals.Quads, 2); // two classes touched quads, not four (repeated mentions don't inflate the count)
	assert.equal(totals.Glutes, 2);
	assert.equal(totals.Core, 1); // from the gymnastics fallback
});

test("real-world gap scenario: a week with no leg-focused class shows zero across all leg-related groups", () => {
	const { totals } = computeMuscleCoverage([
		{ id: 1, date: "2026-08-03", name: "PUMP Hall B", workoutText: "Bench press 5x5, pull-ups 3x10" },
		{ id: 2, date: "2026-08-04", name: "Gymnastics Hall B", workoutText: null },
	]);
	assert.equal(totals.Quads, 0);
	assert.equal(totals.Hamstrings, 0);
	assert.equal(totals.Glutes, 0);
	assert.equal(totals.Calves, 0);
});
