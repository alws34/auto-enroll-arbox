// Wraps react-body-highlighter (MIT, https://www.npmjs.com/package/react-body-highlighter)
// for an actual anatomical front/back muscle diagram instead of a hand-drawn
// one. It takes a plain list of "exercises" ({ name, muscles }) and does its
// own frequency aggregation + coloring internally — so `data` here is
// usually either one entry per booked class for the week, or a single entry
// for the one class the detail modal is showing.
import Model from "react-body-highlighter";

// Keep this list, movementDictionary.js, categoryMuscleMap.js, and
// muscleCategoryFallback.js in sync — these are react-body-highlighter's
// muscle slugs (a couple of its supported slugs — adductor, abductors, head,
// neck — are left out because nothing in our movement dictionary can
// confidently infer them from a class name or WOD text).
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

// "front-deltoids" -> "Front Deltoids", for display in gap callouts and lists.
export function formatMuscleName(slug) {
	return slug
		.split("-")
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(" ");
}

const HIGHLIGHTED_COLORS = ["#1f5d7a", "#2489b8", "#3ab0f2", "#7cd0ff"];
const BODY_COLOR = "#242428";

export function MuscleMap({ data, size = "normal" }) {
	const width = size === "compact" ? "110px" : "180px";
	return (
		<div className={`muscle-map muscle-map-${size}`}>
			<div className="muscle-map-figure">
				<Model
					data={data}
					type="anterior"
					bodyColor={BODY_COLOR}
					highlightedColors={HIGHLIGHTED_COLORS}
					style={{ width, padding: 0 }}
				/>
				<div className="muscle-map-label">Front</div>
			</div>
			<div className="muscle-map-figure">
				<Model
					data={data}
					type="posterior"
					bodyColor={BODY_COLOR}
					highlightedColors={HIGHLIGHTED_COLORS}
					style={{ width, padding: 0 }}
				/>
				<div className="muscle-map-label">Back</div>
			</div>
		</div>
	);
}
