// Stylized front/back muscle diagram, color-coded by how many classes hit
// each muscle group (either a weekly total, or a single class's groups when
// used inside the detail modal). Segmented into anatomical-ish regions
// rather than plain blocks — each region maps 1:1 to one entry in
// MUSCLE_GROUPS. Left/right pairs are drawn once and mirrored with a
// transform so the two sides always stay symmetric.
export const MUSCLE_GROUPS = ["Chest", "Shoulders", "Arms", "Back", "Core", "Glutes", "Quads", "Hamstrings", "Calves"];

const PALETTE = ["#242428", "#1f5d7a", "#2489b8", "#3ab0f2", "#7cd0ff"];
const DECORATIVE = "#3a3a3e";
const GAP_STROKE = "#e05050";
const MIRROR = "translate(200,0) scale(-1,1)";

function colorFor(count) {
	return PALETTE[Math.min(count, PALETTE.length - 1)];
}

const PATHS = {
	neck: "M91,42 L109,42 L106,54 L94,54 Z",
	shoulder: "M112,54 C126,50 142,58 144,76 C145,90 134,100 120,96 C110,93 106,76 108,64 Z",
	chest: "M100,62 C112,58 126,64 130,80 C132,94 122,106 108,108 C100,109 97,100 98,88 Z",
	arm: "M134,72 C146,78 150,100 148,126 C147,150 145,168 147,190 C148,208 145,222 138,224 C130,222 128,208 129,188 C127,166 125,146 126,124 C127,104 128,88 134,72 Z",
	core: "M80,110 C80,104 120,104 120,110 L122,190 C122,204 112,212 100,212 C88,212 78,204 78,190 Z",
	quad: "M108,214 C124,212 148,224 150,258 C151,284 146,306 140,322 C135,334 118,336 112,326 C104,304 102,268 104,238 C105,228 106,220 108,214 Z",
	shin: "M112,324 C122,322 132,328 132,345 C132,365 128,385 122,398 L104,398 C100,385 98,365 100,345 C101,332 104,326 112,324 Z",
	back: "M100,54 C78,56 60,66 56,84 C53,100 58,116 70,126 C66,145 68,165 76,180 L124,180 C132,165 134,145 130,126 C142,116 147,100 144,84 C140,66 122,56 100,54 Z",
	glute: "M100,182 C116,180 132,188 134,204 C135,218 122,226 108,224 C100,222 97,210 100,196 Z",
	hamstring: "M108,222 C124,220 146,232 148,262 C149,286 144,306 138,320 C132,330 116,330 110,320 C104,300 102,266 104,240 C105,232 106,226 108,222 Z",
	calf: "M112,322 C122,320 132,326 132,344 C132,364 128,384 122,397 L104,397 C100,384 98,364 100,344 C101,331 104,325 112,322 Z",
	foot: "M88,404 L116,404 L120,420 L84,420 Z",
};

function Muscle({ id, group, totals, mirror }) {
	const count = totals[group] ?? 0;
	const gap = count === 0;
	return (
		<path
			d={PATHS[id]}
			fill={colorFor(count)}
			stroke={gap ? GAP_STROKE : "#0e0e10"}
			strokeWidth={gap ? 1.5 : 1}
			strokeDasharray={gap ? "3 3" : undefined}
			transform={mirror ? MIRROR : undefined}
		>
			<title>
				{group}: {count} {count === 1 ? "class" : "classes"}
			</title>
		</path>
	);
}

function Decor({ id, mirror, fill = DECORATIVE }) {
	return <path d={PATHS[id]} fill={fill} transform={mirror ? MIRROR : undefined} />;
}

export function MuscleMap({ totals, size = "normal" }) {
	return (
		<div className={`muscle-map muscle-map-${size}`}>
			<div className="muscle-map-figure">
				<svg viewBox="0 0 200 440" className="muscle-map-svg">
					<ellipse cx="100" cy="26" rx="15" ry="18" fill={DECORATIVE} />
					<Decor id="neck" />
					<Muscle id="shoulder" group="Shoulders" totals={totals} />
					<Muscle id="shoulder" group="Shoulders" totals={totals} mirror />
					<Muscle id="chest" group="Chest" totals={totals} />
					<Muscle id="chest" group="Chest" totals={totals} mirror />
					<Muscle id="arm" group="Arms" totals={totals} />
					<Muscle id="arm" group="Arms" totals={totals} mirror />
					<Muscle id="core" group="Core" totals={totals} />
					<Muscle id="quad" group="Quads" totals={totals} />
					<Muscle id="quad" group="Quads" totals={totals} mirror />
					<Decor id="shin" />
					<Decor id="shin" mirror />
					<Decor id="foot" />
					<Decor id="foot" mirror />
				</svg>
				<div className="muscle-map-label">Front</div>
			</div>
			<div className="muscle-map-figure">
				<svg viewBox="0 0 200 440" className="muscle-map-svg">
					<ellipse cx="100" cy="26" rx="15" ry="18" fill={DECORATIVE} />
					<Decor id="neck" />
					<Muscle id="back" group="Back" totals={totals} />
					<Muscle id="shoulder" group="Shoulders" totals={totals} />
					<Muscle id="shoulder" group="Shoulders" totals={totals} mirror />
					<Muscle id="arm" group="Arms" totals={totals} />
					<Muscle id="arm" group="Arms" totals={totals} mirror />
					<Muscle id="glute" group="Glutes" totals={totals} />
					<Muscle id="glute" group="Glutes" totals={totals} mirror />
					<Muscle id="hamstring" group="Hamstrings" totals={totals} />
					<Muscle id="hamstring" group="Hamstrings" totals={totals} mirror />
					<Muscle id="calf" group="Calves" totals={totals} />
					<Muscle id="calf" group="Calves" totals={totals} mirror />
					<Decor id="foot" />
					<Decor id="foot" mirror />
				</svg>
				<div className="muscle-map-label">Back</div>
			</div>
		</div>
	);
}
