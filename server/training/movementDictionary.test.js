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
	assert.deepEqual(new Set(groups), new Set(["upper-back", "back-deltoids", "biceps"]));
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
	assert.deepEqual(new Set(findMuscleGroups("3 squats").groups), new Set(["quadriceps", "gluteal"]));
	assert.deepEqual(new Set(findMuscleGroups("push-ups").groups), new Set(["chest", "triceps", "front-deltoids"]));
	assert.deepEqual(new Set(findMuscleGroups("push ups").groups), new Set(["chest", "triceps", "front-deltoids"]));
});
