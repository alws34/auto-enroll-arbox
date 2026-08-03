import { useEffect, useState } from "react";
import { buildGoogleCalendarUrl } from "../googleCalendar.js";
import { api } from "../api.js";

const REMINDER_OPTIONS = [
	{ value: 15, label: "15 minutes before" },
	{ value: 30, label: "30 minutes before" },
	{ value: 60, label: "1 hour before" },
	{ value: 120, label: "2 hours before" },
	{ value: 1440, label: "1 day before" },
];

const MAX_REMINDERS = 2;

export function ClassDetailModal({ classInfo, onClose, onCancel }) {
	const [reminders, setReminders] = useState([]);
	const [addingMinutes, setAddingMinutes] = useState(REMINDER_OPTIONS[0].value);
	const [error, setError] = useState(null);
	const [workout, setWorkout] = useState({ status: "idle", sections: [] });

	useEffect(() => {
		if (!classInfo) return;
		api
			.listReminders(classInfo.id)
			.then(setReminders)
			.catch((err) => setError(err.message));
	}, [classInfo?.id]);

	useEffect(() => {
		if (!classInfo?.workoutId) {
			setWorkout({ status: "idle", sections: [] });
			return;
		}
		setWorkout({ status: "loading", sections: [] });
		api
			.getWorkout(classInfo.workoutId)
			.then((res) => setWorkout({ status: "loaded", sections: res.sections || [] }))
			.catch(() => setWorkout({ status: "error", sections: [] }));
	}, [classInfo?.workoutId]);

	if (!classInfo) return null;

	const calendarUrl = buildGoogleCalendarUrl({
		title: classInfo.name,
		startUtc: classInfo.startUtc,
		endUtc: classInfo.endUtc,
		details: classInfo.coach ? `Coach: ${classInfo.coach}` : "",
		location: "CrossFit White City",
	});

	async function handleCancel() {
		const result = await onCancel(classInfo);
		if (result.ok) {
			onClose();
		} else {
			setError(result.error);
		}
	}

	async function handleAddReminder() {
		setError(null);
		try {
			const reminder = await api.addReminder(classInfo, Number(addingMinutes));
			setReminders((prev) => [...prev, reminder]);
		} catch (err) {
			setError(err.message);
		}
	}

	async function handleRemoveReminder(id) {
		try {
			await api.deleteReminder(id);
			setReminders((prev) => prev.filter((r) => r.id !== id));
		} catch (err) {
			setError(err.message);
		}
	}

	const usedMinutes = new Set(reminders.map((r) => r.minutesBefore));
	const availableOptions = REMINDER_OPTIONS.filter((o) => !usedMinutes.has(o.value));

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-card" onClick={(e) => e.stopPropagation()}>
				<button className="modal-close" onClick={onClose}>
					×
				</button>
				<h2>{classInfo.name}</h2>
				<p className="modal-meta">
					{classInfo.date} · {classInfo.time}–{classInfo.endTime}
				</p>
				<p className="modal-meta">Coach: {classInfo.coach || "—"}</p>
				<p className="modal-meta">
					{classInfo.bookedCount}/{classInfo.maxUsers} booked
				</p>
				<div className={`job-status-badge job-status-${classInfo.jobStatus}`}>{classInfo.jobStatus}</div>

				<h3>Workout</h3>
				{!classInfo.workoutId && (
					<p className="modal-note">
						This gym hasn't published a workout plan for this class yet — check the board at the box.
					</p>
				)}
				{classInfo.workoutId && workout.status === "loading" && <p className="modal-note">Loading workout…</p>}
				{classInfo.workoutId && workout.status === "error" && (
					<p className="modal-note">Couldn't load the workout right now — check the board at the box.</p>
				)}
				{classInfo.workoutId && workout.status === "loaded" && workout.sections.length === 0 && (
					<p className="modal-note">No workout details published for this class yet.</p>
				)}
				{classInfo.workoutId &&
					workout.status === "loaded" &&
					workout.sections.map((section, i) => (
						<div className="workout-section" key={i}>
							{section.section && <h4 className="workout-section-title">{section.section}</h4>}
							<p className="workout-section-text">{section.text}</p>
						</div>
					))}

				<h3>Reminders</h3>
				{reminders.map((r) => (
					<div className="reminder-row" key={r.id}>
						<span>{REMINDER_OPTIONS.find((o) => o.value === r.minutesBefore)?.label || `${r.minutesBefore} min before`}</span>
						<button className="reminder-remove" onClick={() => handleRemoveReminder(r.id)}>
							×
						</button>
					</div>
				))}
				{reminders.length < MAX_REMINDERS && availableOptions.length > 0 && (
					<div className="reminder-row">
						<select className="mock-input" value={addingMinutes} onChange={(e) => setAddingMinutes(e.target.value)}>
							{availableOptions.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
						<button className="btn btn-secondary" onClick={handleAddReminder}>
							Add
						</button>
					</div>
				)}
				{reminders.length >= MAX_REMINDERS && <p className="modal-note">Max {MAX_REMINDERS} reminders per class.</p>}

				{error && <p className="page-error">{error}</p>}

				<div className="modal-actions">
					<a className="btn btn-primary" href={calendarUrl} target="_blank" rel="noopener noreferrer">
						Add to Google Calendar
					</a>
					<button className="btn btn-danger" onClick={handleCancel}>
						Cancel booking
					</button>
				</div>
			</div>
		</div>
	);
}
