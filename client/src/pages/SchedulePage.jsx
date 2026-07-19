import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { DayTabs } from "../components/DayTabs.jsx";
import { ClassRow } from "../components/ClassRow.jsx";
import { QuotaStrip } from "../components/QuotaStrip.jsx";
import { StatusLegend } from "../components/StatusLegend.jsx";
import { WeeklyCalendar } from "../components/WeeklyCalendar.jsx";
import { ClassDetailModal } from "../components/ClassDetailModal.jsx";

const WEEK_LENGTH = 7;

function dayLabel(dateStr) {
	const d = new Date(`${dateStr}T00:00:00`);
	return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function todayIso() {
	return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateStr, delta) {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}

export function SchedulePage() {
	const [weekStart, setWeekStart] = useState(todayIso());
	const [classes, setClasses] = useState([]);
	const [quota, setQuota] = useState({ used: 0, limit: 0 });
	const [selectedDate, setSelectedDate] = useState(null);
	const [loadError, setLoadError] = useState(null);
	const [actionError, setActionError] = useState(null);
	const [loading, setLoading] = useState(true);
	const [modalClass, setModalClass] = useState(null);

	async function load() {
		setLoading(true);
		setLoadError(null);
		try {
			const data = await api.getSchedule(WEEK_LENGTH, weekStart);
			setClasses(data.classes);
			setQuota(data.quota);
			setSelectedDate(weekStart);
		} catch (err) {
			setLoadError(err.message);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, [weekStart]);

	const days = useMemo(
		() => Array.from({ length: WEEK_LENGTH }, (_, i) => addDaysIso(weekStart, i)).map((date) => ({ date, label: dayLabel(date) })),
		[weekStart]
	);

	const visibleClasses = classes.filter((c) => c.date === selectedDate);

	async function handleSchedule(classInfo) {
		setActionError(null);
		try {
			await api.scheduleJob(classInfo.id, classInfo.date);
			await load();
		} catch (err) {
			setActionError(err.message);
		}
	}

	// Arbox is the source of truth for booking state — a class registered from the
	// official app has no local job row, so cancelling it can't go through /jobs/:id.
	// Returns { ok, error } so the detail modal knows whether to close itself and can
	// show the failure (e.g. Arbox's "class already started") without losing context.
	async function handleCancel(classInfo) {
		setActionError(null);
		try {
			if (classInfo.jobId) await api.cancelJob(classInfo.jobId);
			else await api.cancelArboxRegistration(classInfo.id);
			await load();
			return { ok: true };
		} catch (err) {
			setActionError(err.message);
			return { ok: false, error: err.message };
		}
	}

	if (loading) return <p className="page-status">Loading schedule…</p>;
	if (loadError) return <p className="page-status page-error">{loadError}</p>;

	return (
		<div className="schedule-page">
			<StatusLegend />
			<QuotaStrip used={quota.used} limit={quota.limit} />
			{actionError && <p className="page-error action-error">{actionError}</p>}
			<div className="week-nav">
				<button className="btn btn-secondary" onClick={() => setWeekStart((w) => addDaysIso(w, -WEEK_LENGTH))}>
					‹
				</button>
				<h3 className="section-heading">
					My schedule — {days[0]?.date} to {days[WEEK_LENGTH - 1]?.date}
				</h3>
				<button className="btn btn-secondary" onClick={() => setWeekStart((w) => addDaysIso(w, WEEK_LENGTH))}>
					›
				</button>
			</div>
			<WeeklyCalendar days={days} classes={classes} onSelect={setModalClass} />
			<DayTabs days={days} selectedDate={selectedDate} onSelect={setSelectedDate} />
			<div className="class-list">
				{visibleClasses.map((c) => (
					<ClassRow key={c.id} classInfo={c} onSchedule={handleSchedule} onCancel={() => handleCancel(c)} />
				))}
				{visibleClasses.length === 0 && <p className="page-status">No classes this day.</p>}
			</div>
			{modalClass && (
				<ClassDetailModal classInfo={modalClass} onClose={() => setModalClass(null)} onCancel={handleCancel} />
			)}
		</div>
	);
}
