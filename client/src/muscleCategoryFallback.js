// Client-side mirror of server/training/categoryMuscleMap.js — used by
// ClassDetailModal to guess a single class's muscle groups instantly (no
// extra request) when it has no WOD published, or the server already told
// us its WOD text matched no known movement. Keep this in sync with the
// server copy if you edit the category rules.
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
