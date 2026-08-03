// Simplified front/back body diagram, color-coded by how many booked classes
// this week hit each muscle group. Deliberately blocky/schematic rather than
// anatomical — each shape maps 1:1 to one entry in MUSCLE_GROUPS so the
// coloring logic stays trivial. Front carries Chest/Shoulders/Arms/Core/Quads,
// back carries Back/Glutes/Hamstrings/Calves — each group is drawn exactly
// once so a count can't be double-counted visually.
const PALETTE = ["#242428", "#1f5d7a", "#2489b8", "#3ab0f2", "#7cd0ff"];
const DECORATIVE = "#3a3a3e";
const GAP_STROKE = "#e05050";

function colorFor(count) {
	return PALETTE[Math.min(count, PALETTE.length - 1)];
}

function Part({ group, totals, ...shapeProps }) {
	const count = totals[group] ?? 0;
	const gap = count === 0;
	const Tag = shapeProps.tag || "rect";
	const { tag, ...rest } = shapeProps;
	return (
		<g>
			<Tag {...rest} fill={colorFor(count)} stroke={gap ? GAP_STROKE : "#0e0e10"} strokeWidth={gap ? 1.5 : 1} strokeDasharray={gap ? "3 3" : undefined}>
				<title>
					{group}: {count} {count === 1 ? "class" : "classes"} this week
				</title>
			</Tag>
		</g>
	);
}

export function MuscleMap({ totals }) {
	return (
		<div className="muscle-map">
			<div className="muscle-map-figure">
				<svg viewBox="0 0 160 260" className="muscle-map-svg">
					<circle cx="80" cy="18" r="14" fill={DECORATIVE} />
					<rect x="73" y="30" width="14" height="9" fill={DECORATIVE} />
					<Part group="Shoulders" totals={totals} tag="circle" cx="42" cy="48" r="12" />
					<Part group="Shoulders" totals={totals} tag="circle" cx="118" cy="48" r="12" />
					<Part group="Arms" totals={totals} tag="rect" x="28" y="56" width="20" height="75" rx="9" />
					<Part group="Arms" totals={totals} tag="rect" x="112" y="56" width="20" height="75" rx="9" />
					<Part group="Chest" totals={totals} tag="rect" x="53" y="40" width="54" height="40" rx="9" />
					<Part group="Core" totals={totals} tag="rect" x="56" y="83" width="48" height="48" rx="9" />
					<Part group="Quads" totals={totals} tag="rect" x="53" y="135" width="24" height="70" rx="9" />
					<Part group="Quads" totals={totals} tag="rect" x="83" y="135" width="24" height="70" rx="9" />
					<rect x="51" y="207" width="26" height="12" rx="4" fill={DECORATIVE} />
					<rect x="83" y="207" width="26" height="12" rx="4" fill={DECORATIVE} />
				</svg>
				<div className="muscle-map-label">Front</div>
			</div>
			<div className="muscle-map-figure">
				<svg viewBox="0 0 160 260" className="muscle-map-svg">
					<circle cx="80" cy="18" r="14" fill={DECORATIVE} />
					<rect x="73" y="30" width="14" height="9" fill={DECORATIVE} />
					<circle cx="42" cy="48" r="12" fill={DECORATIVE} />
					<circle cx="118" cy="48" r="12" fill={DECORATIVE} />
					<rect x="28" y="56" width="20" height="75" rx="9" fill={DECORATIVE} />
					<rect x="112" y="56" width="20" height="75" rx="9" fill={DECORATIVE} />
					<Part group="Back" totals={totals} tag="rect" x="53" y="40" width="54" height="55" rx="9" />
					<Part group="Glutes" totals={totals} tag="rect" x="53" y="97" width="54" height="30" rx="9" />
					<Part group="Hamstrings" totals={totals} tag="rect" x="53" y="129" width="24" height="50" rx="9" />
					<Part group="Hamstrings" totals={totals} tag="rect" x="83" y="129" width="24" height="50" rx="9" />
					<Part group="Calves" totals={totals} tag="rect" x="53" y="181" width="24" height="45" rx="9" />
					<Part group="Calves" totals={totals} tag="rect" x="83" y="181" width="24" height="45" rx="9" />
					<rect x="51" y="228" width="26" height="12" rx="4" fill={DECORATIVE} />
					<rect x="83" y="228" width="26" height="12" rx="4" fill={DECORATIVE} />
				</svg>
				<div className="muscle-map-label">Back</div>
			</div>
		</div>
	);
}
