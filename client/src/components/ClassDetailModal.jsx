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

	useEffect(() => {
		if (!classInfo) return;
		api
			.listReminders(classInfo.id)
			.then(setReminders)
			.catch((err) => setError(err.message));
	}, [classInfo?.id]);

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
				<p className="modal-note">
					This gym doesn't publish a workout plan through Arbox for this class — check the board at the box.
				</p>

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
