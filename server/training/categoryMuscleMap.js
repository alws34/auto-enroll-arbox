// Coarse fallback used only when a class has no WOD text at all, or its WOD
// text didn't match any known movement in movementDictionary.js. Arbox
// category names include the room (e.g. "PUMP Hall B", "Gymnastics Hall B"),
// so rules match on a keyword found anywhere in the name rather than an
// exact match. Edit this list to match your own box's actual class names —
// it's a static guess, not derived from anything Arbox provides.
const CATEGORY_RULES = [
	{ keyword: "pump", groups: ["Chest", "Back", "Shoulders", "Arms"] },
	{ keyword: "gymnastics", groups: ["Core", "Shoulders", "Arms"] },
	{ keyword: "weightlifting", groups: ["Back", "Quads", "Glutes", "Shoulders"] },
	{ keyword: "olympic", groups: ["Back", "Quads", "Glutes", "Shoulders"] },
	{ keyword: "w.o.d", groups: ["Chest", "Back", "Shoulders", "Arms", "Core", "Quads", "Hamstrings", "Glutes", "Calves"] },
	{ keyword: "wod", groups: ["Chest", "Back", "Shoulders", "Arms", "Core", "Quads", "Hamstrings", "Glutes", "Calves"] },
	{ keyword: "crossfit", groups: ["Chest", "Back", "Shoulders", "Arms", "Core", "Quads", "Hamstrings", "Glutes", "Calves"] },
	{ keyword: "metcon", groups: ["Chest", "Back", "Shoulders", "Arms", "Core", "Quads", "Hamstrings", "Glutes", "Calves"] },
	{ keyword: "endurance", groups: ["Quads", "Hamstrings", "Calves"] },
	{ keyword: "cardio", groups: ["Quads", "Hamstrings", "Calves"] },
	{ keyword: "run", groups: ["Quads", "Hamstrings", "Calves"] },
	{ keyword: "yoga", groups: ["Core"] },
	{ keyword: "mobility", groups: ["Core"] },
	{ keyword: "stretch", groups: ["Core"] },
];

export function categoryFallbackGroups(categoryName) {
	if (!categoryName) return [];
	const lower = categoryName.toLowerCase();
	const rule = CATEGORY_RULES.find((r) => lower.includes(r.keyword));
	return rule ? rule.groups : [];
}
