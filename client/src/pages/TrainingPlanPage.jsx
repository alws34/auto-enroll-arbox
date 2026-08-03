import { useEffect, useState } from "react";
import { api } from "../api.js";
import { MuscleMap, formatMuscleName } from "../components/MuscleMap.jsx";

const WEEK_LENGTH = 7;

function todayIso() {
	return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateStr, delta) {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}

const SOURCE_LABEL = {
	wod: "from the posted workout",
	category: "estimated from class type",
	none: "not enough info to guess",
};

export function TrainingPlanPage() {
	const [weekStart, setWeekStart] = useState(todayIso());
	const [data, setData] = useState(null);
	const [error, setError] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		setError(null);
		api
			.getTrainingCoverage(WEEK_LENGTH, weekStart)
			.then(setData)
			.catch((err) => setError(err.message))
			.finally(() => setLoading(false));
	}, [weekStart]);

	if (loading) return <p className="page-status">Loading training plan…</p>;
	if (error) return <p className="page-status page-error">{error}</p>;
	if (!data) return null;

	const gaps = Object.entries(data.totals)
		.filter(([, count]) => count === 0)
		.map(([group]) => formatMuscleName(group));

	const muscleMapData = data.breakdown.map((c) => ({ name: c.name, muscles: c.muscleGroups }));

	return (
		<div className="training-plan-page">
			<div className="week-nav">
				<button className="btn btn-secondary" onClick={() => setWeekStart((w) => addDaysIso(w, -WEEK_LENGTH))}>
					‹
				</button>
				<h3 className="section-heading">
					Training plan — {data.weekStart} to {data.weekEnd}
				</h3>
				<button className="btn btn-secondary" onClick={() => setWeekStart((w) => addDaysIso(w, WEEK_LENGTH))}>
					›
				</button>
			</div>

			<p className="modal-note">
				Based on the classes you've booked or waitlisted into this week — not everything you've ever attended.
			</p>

			<MuscleMap data={muscleMapData} />

			{gaps.length > 0 ? (
				<p className="training-gap-callout">Nothing booked yet for: {gaps.join(", ")}.</p>
			) : (
				<p className="training-gap-callout training-gap-callout-clear">Every muscle group has at least one class booked this week.</p>
			)}

			<h3 className="section-heading">This week's booked classes</h3>
			{data.breakdown.length === 0 && <p className="page-status">Nothing booked this week yet.</p>}
			<div className="class-list">
				{data.breakdown.map((c) => (
					<div className="class-row training-breakdown-row" key={c.id}>
						<div>
							<div className="class-row-name">{c.name}</div>
							<div className="class-row-meta">{c.date}</div>
							<div className="class-row-meta">
								{c.muscleGroups.length > 0 ? c.muscleGroups.map(formatMuscleName).join(", ") : "No muscle groups identified"} ·{" "}
								{SOURCE_LABEL[c.source]}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
