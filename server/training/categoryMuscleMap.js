// Coarse fallback used only when a class has no WOD text at all, or its WOD
// text didn't match any known movement in movementDictionary.js. Arbox
// category names include the room (e.g. "PUMP Hall B", "Gymnastics Hall B"),
// so rules match on a keyword found anywhere in the name rather than an
// exact match. Edit this list to match your own box's actual class names —
// it's a static guess, not derived from anything Arbox provides.
//
// Group names match react-body-highlighter's muscle slugs — keep this file,
// movementDictionary.js, and client/src/muscleCategoryFallback.js in sync.
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
