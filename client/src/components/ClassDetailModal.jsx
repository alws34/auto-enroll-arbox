import { buildGoogleCalendarUrl } from "../googleCalendar.js";

export function ClassDetailModal({ classInfo, onClose, onCancel }) {
	if (!classInfo) return null;

	const calendarUrl = buildGoogleCalendarUrl({
		title: classInfo.name,
		startUtc: classInfo.startUtc,
		endUtc: classInfo.endUtc,
		details: classInfo.coach ? `Coach: ${classInfo.coach}` : "",
		location: "CrossFit White City",
	});

	async function handleCancel() {
		await onCancel(classInfo);
		onClose();
	}

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
