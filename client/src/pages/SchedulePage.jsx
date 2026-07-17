import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { DayTabs } from "../components/DayTabs.jsx";
import { ClassRow } from "../components/ClassRow.jsx";
import { QuotaStrip } from "../components/QuotaStrip.jsx";
import { StatusLegend } from "../components/StatusLegend.jsx";
import { WeeklyCalendar } from "../components/WeeklyCalendar.jsx";
import { ClassDetailModal } from "../components/ClassDetailModal.jsx";

function dayLabel(dateStr) {
	const d = new Date(`${dateStr}T00:00:00`);
	return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

export function SchedulePage() {
	const [classes, setClasses] = useState([]);
	const [quota, setQuota] = useState({ used: 0, limit: 0 });
	const [selectedDate, setSelectedDate] = useState(null);
	const [error, setError] = useState(null);
	const [loading, setLoading] = useState(true);
	const [modalClass, setModalClass] = useState(null);

	async function load() {
		setLoading(true);
		setError(null);
		try {
			const data = await api.getSchedule(7);
			setClasses(data.classes);
			setQuota(data.quota);
			if (!selectedDate && data.classes.length > 0) setSelectedDate(data.classes[0].date);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, []);

	const days = useMemo(() => {
		const uniqueDates = [...new Set(classes.map((c) => c.date))].sort();
		return uniqueDates.map((date) => ({ date, label: dayLabel(date) }));
	}, [classes]);

	const visibleClasses = classes.filter((c) => c.date === selectedDate);

	async function handleSchedule(classInfo) {
		try {
			await api.scheduleJob(classInfo.id, classInfo.date);
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	// Arbox is the source of truth for booking state — a class registered from the
	// official app has no local job row, so cancelling it can't go through /jobs/:id.
	async function handleCancel(classInfo) {
		try {
			if (classInfo.jobId) await api.cancelJob(classInfo.jobId);
			else await api.cancelArboxRegistration(classInfo.id);
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	if (loading) return <p className="page-status">Loading schedule…</p>;
	if (error) return <p className="page-status page-error">{error}</p>;

	return (
		<div className="schedule-page">
			<StatusLegend />
			<QuotaStrip used={quota.used} limit={quota.limit} />
			<h3 className="section-heading">My schedule</h3>
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
