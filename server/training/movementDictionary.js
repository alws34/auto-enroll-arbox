// Rule-based (no LLM) mapping from workout movements to muscle groups. This
// is intentionally a small, editable keyword dictionary rather than an
// exhaustive exercise database — it's meant to catch the movements that show
// up constantly in CrossFit-style WODs, not every possible exercise.

// Group names match the muscle slugs used by the react-body-highlighter
// npm package (client/src/components/MuscleMap.jsx), so a class's matched
// groups can be handed straight to it. Keep MUSCLE_GROUPS, this dictionary,
// categoryMuscleMap.js, and client/src/muscleCategoryFallback.js in sync if
// you edit the slug list.
export const MUSCLE_GROUPS = [
	"trapezius",
	"upper-back",
	"lower-back",
	"chest",
	"biceps",
	"triceps",
	"forearm",
	"back-deltoids",
	"front-deltoids",
	"abs",
	"obliques",
	"hamstring",
	"quadriceps",
	"calves",
	"gluteal",
];

// Order doesn't matter — a single WOD can (and usually does) match several
// movements at once, e.g. "21-15-9 Thrusters / Pull-ups" hits both.
const MOVEMENTS = [
	{ keywords: ["back squat", "front squat", "air squat", "goblet squat", "overhead squat", "squat"], groups: ["quadriceps", "gluteal"] },
	{ keywords: ["deadlift"], groups: ["lower-back", "hamstring", "gluteal"] },
	{ keywords: ["lunge"], groups: ["quadriceps", "gluteal"] },
	{ keywords: ["step-up", "step up"], groups: ["quadriceps", "gluteal"] },
	{ keywords: ["box jump"], groups: ["quadriceps", "gluteal", "calves"] },
	{ keywords: ["wall ball", "wall-ball"], groups: ["quadriceps", "gluteal", "front-deltoids"] },
	{ keywords: ["thruster"], groups: ["quadriceps", "gluteal", "front-deltoids", "triceps"] },
	{ keywords: ["clean"], groups: ["lower-back", "quadriceps", "gluteal", "trapezius", "front-deltoids"] },
	{ keywords: ["snatch"], groups: ["lower-back", "quadriceps", "gluteal", "trapezius", "front-deltoids"] },
	{ keywords: ["jerk"], groups: ["front-deltoids", "triceps", "quadriceps"] },
	{ keywords: ["push press"], groups: ["front-deltoids", "triceps"] },
	{ keywords: ["strict press", "overhead press", "shoulder press", "press"], groups: ["front-deltoids", "triceps"] },
	{ keywords: ["kb swing", "kettlebell swing", "swing"], groups: ["gluteal", "hamstring", "lower-back"] },
	{ keywords: ["pull-up", "pull up", "chin-up", "chin up"], groups: ["upper-back", "biceps", "forearm"] },
	{ keywords: ["muscle-up", "muscle up"], groups: ["upper-back", "chest", "triceps", "biceps"] },
	{ keywords: ["rope climb"], groups: ["upper-back", "biceps", "forearm"] },
	{ keywords: ["row", "rowing", "erg"], groups: ["upper-back", "back-deltoids", "biceps"] },
	{ keywords: ["push-up", "push up", "push-ups", "push ups"], groups: ["chest", "triceps", "front-deltoids"] },
	{ keywords: ["bench press"], groups: ["chest", "triceps", "front-deltoids"] },
	{ keywords: ["dip"], groups: ["chest", "triceps"] },
	{ keywords: ["handstand push-up", "handstand push up", "hspu"], groups: ["front-deltoids", "triceps"] },
	{ keywords: ["curl"], groups: ["biceps"] },
	{ keywords: ["sit-up", "sit up", "situp"], groups: ["abs"] },
	{ keywords: ["toes-to-bar", "toes to bar", "t2b"], groups: ["abs"] },
	{ keywords: ["plank"], groups: ["abs"] },
	{ keywords: ["hollow"], groups: ["abs"] },
	{ keywords: ["ghd"], groups: ["abs", "lower-back", "hamstring"] },
	{ keywords: ["russian twist"], groups: ["obliques"] },
	{ keywords: ["burpee"], groups: ["chest", "abs", "quadriceps"] },
	{ keywords: ["double under", "double-under", "jump rope"], groups: ["calves"] },
	{ keywords: ["run", "running"], groups: ["quadriceps", "hamstring", "calves"] },
	{ keywords: ["bike", "biking", "assault bike", "echo bike", "airbike"], groups: ["quadriceps", "hamstring", "calves"] },
	{ keywords: ["farmer carry", "farmers carry", "farmer's carry"], groups: ["forearm", "trapezius", "abs"] },
	{ keywords: ["sled push", "sled pull"], groups: ["quadriceps", "gluteal"] },
	{ keywords: ["calf raise"], groups: ["calves"] },
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
