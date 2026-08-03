// Client-side mirror of server/training/categoryMuscleMap.js — used by
// ClassDetailModal to guess a single class's muscle groups instantly (no
// extra request) when it has no WOD published, or the server already told
// us its WOD text matched no known movement. Keep this in sync with the
// server copy if you edit the category rules.
//
// Group names match react-body-highlighter's muscle slugs.
const FULL_BODY = [
	"chest",
	"upper-back",
	"lower-back",
	"front-deltoids",
	"back-deltoids",
	"biceps",
	"triceps",
	"forearm",
	"abs",
	"obliques",
	"quadriceps",
	"hamstring",
	"gluteal",
	"calves",
	"trapezius",
];

const CATEGORY_RULES = [
	{ keyword: "pump", groups: ["chest", "upper-back", "front-deltoids", "biceps", "triceps"] },
	{ keyword: "gymnastics", groups: ["abs", "front-deltoids", "biceps", "upper-back"] },
	{ keyword: "weightlifting", groups: ["lower-back", "quadriceps", "gluteal", "front-deltoids", "trapezius"] },
	{ keyword: "olympic", groups: ["lower-back", "quadriceps", "gluteal", "front-deltoids", "trapezius"] },
	{ keyword: "w.o.d", groups: FULL_BODY },
	{ keyword: "wod", groups: FULL_BODY },
	{ keyword: "crossfit", groups: FULL_BODY },
	{ keyword: "metcon", groups: FULL_BODY },
	{ keyword: "endurance", groups: ["quadriceps", "hamstring", "calves"] },
	{ keyword: "cardio", groups: ["quadriceps", "hamstring", "calves"] },
	{ keyword: "run", groups: ["quadriceps", "hamstring", "calves"] },
	{ keyword: "yoga", groups: ["abs"] },
	{ keyword: "mobility", groups: ["abs"] },
	{ keyword: "stretch", groups: ["abs"] },
];

export function categoryFallbackGroups(categoryName) {
	if (!categoryName) return [];
	const lower = categoryName.toLowerCase();
	const rule = CATEGORY_RULES.find((r) => lower.includes(r.keyword));
	return rule ? rule.groups : [];
}
