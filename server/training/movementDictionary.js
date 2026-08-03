// Rule-based (no LLM) mapping from workout movements to muscle groups. This
// is intentionally a small, editable keyword dictionary rather than an
// exhaustive exercise database — it's meant to catch the movements that show
// up constantly in CrossFit-style WODs, not every possible exercise.

// Kept small on purpose so it lines up with a simple two-view (front/back)
// body diagram rather than full anatomical detail.
export const MUSCLE_GROUPS = ["Chest", "Shoulders", "Arms", "Back", "Core", "Glutes", "Quads", "Hamstrings", "Calves"];

// Order doesn't matter — a single WOD can (and usually does) match several
// movements at once, e.g. "21-15-9 Thrusters / Pull-ups" hits both.
const MOVEMENTS = [
	{ keywords: ["back squat", "front squat", "air squat", "goblet squat", "overhead squat", "squat"], groups: ["Quads", "Glutes"] },
	{ keywords: ["deadlift"], groups: ["Back", "Hamstrings", "Glutes"] },
	{ keywords: ["lunge"], groups: ["Quads", "Glutes"] },
	{ keywords: ["step-up", "step up"], groups: ["Quads", "Glutes"] },
	{ keywords: ["box jump"], groups: ["Quads", "Glutes", "Calves"] },
	{ keywords: ["wall ball", "wall-ball"], groups: ["Quads", "Glutes", "Shoulders"] },
	{ keywords: ["thruster"], groups: ["Quads", "Glutes", "Shoulders"] },
	{ keywords: ["clean"], groups: ["Back", "Quads", "Glutes", "Shoulders"] },
	{ keywords: ["snatch"], groups: ["Back", "Quads", "Glutes", "Shoulders"] },
	{ keywords: ["jerk"], groups: ["Shoulders", "Quads"] },
	{ keywords: ["push press"], groups: ["Shoulders"] },
	{ keywords: ["strict press", "overhead press", "shoulder press", "press"], groups: ["Shoulders"] },
	{ keywords: ["kb swing", "kettlebell swing", "swing"], groups: ["Glutes", "Hamstrings", "Back"] },
	{ keywords: ["pull-up", "pull up", "chin-up", "chin up"], groups: ["Back", "Arms"] },
	{ keywords: ["muscle-up", "muscle up"], groups: ["Back", "Arms", "Chest"] },
	{ keywords: ["rope climb"], groups: ["Back", "Arms"] },
	{ keywords: ["row", "rowing", "erg"], groups: ["Back", "Arms"] },
	{ keywords: ["push-up", "push up", "push-ups", "push ups"], groups: ["Chest", "Arms"] },
	{ keywords: ["bench press"], groups: ["Chest", "Arms"] },
	{ keywords: ["dip"], groups: ["Chest", "Arms"] },
	{ keywords: ["handstand push-up", "handstand push up", "hspu"], groups: ["Shoulders", "Arms"] },
	{ keywords: ["curl"], groups: ["Arms"] },
	{ keywords: ["sit-up", "sit up", "situp"], groups: ["Core"] },
	{ keywords: ["toes-to-bar", "toes to bar", "t2b"], groups: ["Core"] },
	{ keywords: ["plank"], groups: ["Core"] },
	{ keywords: ["hollow"], groups: ["Core"] },
	{ keywords: ["ghd"], groups: ["Core", "Hamstrings"] },
	{ keywords: ["russian twist"], groups: ["Core"] },
	{ keywords: ["burpee"], groups: ["Chest", "Core", "Quads"] },
	{ keywords: ["double under", "double-under", "jump rope"], groups: ["Calves"] },
	{ keywords: ["run", "running"], groups: ["Quads", "Hamstrings", "Calves"] },
	{ keywords: ["bike", "biking", "assault bike", "echo bike", "airbike"], groups: ["Quads", "Hamstrings", "Calves"] },
	{ keywords: ["farmer carry", "farmers carry", "farmer's carry"], groups: ["Arms", "Back", "Core"] },
	{ keywords: ["sled push", "sled pull"], groups: ["Quads", "Glutes"] },
	{ keywords: ["calf raise"], groups: ["Calves"] },
];

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Scans free-form WOD text and returns the set of muscle groups it implies,
// plus which movement keywords actually matched (useful for showing the user
// why a class was tagged the way it was). A class matching zero known
// movements returns an empty set — the caller decides whether to fall back
// to a coarser category-based guess in that case.
export function findMuscleGroups(text) {
	if (!text) return { groups: [], matchedMovements: [] };
	const hitGroups = new Set();
	const matchedMovements = [];
	for (const movement of MOVEMENTS) {
		const matched = movement.keywords.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}s?\\b`, "i").test(text));
		if (matched) {
			matchedMovements.push(movement.keywords[0]);
			movement.groups.forEach((g) => hitGroups.add(g));
		}
	}
	return { groups: [...hitGroups], matchedMovements };
}
