import { findMuscleGroups, MUSCLE_GROUPS } from "./movementDictionary.js";
import { categoryFallbackGroups } from "./categoryMuscleMap.js";

// classes: [{ id, date, name (category), workoutText: string|null }]
// workoutText is the flattened WOD comment text for that class (the caller
// is responsible for fetching it — this module has no network/DB access so
// it stays trivially unit-testable). Returns per-muscle-group hit counts for
// the whole list plus a per-class breakdown so the UI can explain itself.
export function computeMuscleCoverage(classes) {
	const totals = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0]));
	const breakdown = classes.map((c) => {
		let groups = [];
		let source = "none";

		// needsReview means the box actually published a WOD and our movement
		// dictionary recognized nothing in it — a real gap, distinct from "no
		// WOD was published at all". No static keyword list stays complete
		// forever against free-text gym programming, so this flag (plus the
		// raw text below) is how gaps get surfaced instead of silently
		// mis-tagged via the category fallback. See TrainingPlanPage's
		// "Coverage gaps" section and scripts/coverage-audit.js.
		let needsReview = false;

		if (c.workoutText) {
			const { groups: wodGroups } = findMuscleGroups(c.workoutText);
			if (wodGroups.length > 0) {
				groups = wodGroups;
				source = "wod";
			} else {
				needsReview = true;
			}
		}
		if (groups.length === 0) {
			const fallbackGroups = categoryFallbackGroups(c.name);
			if (fallbackGroups.length > 0) {
				groups = fallbackGroups;
				source = "category";
			}
		}

		groups.forEach((g) => {
			if (g in totals) totals[g] += 1;
		});

		return {
			id: c.id,
			date: c.date,
			name: c.name,
			muscleGroups: groups,
			source,
			needsReview,
			workoutText: needsReview ? c.workoutText : null,
		};
	});

	return { totals, breakdown };
}
