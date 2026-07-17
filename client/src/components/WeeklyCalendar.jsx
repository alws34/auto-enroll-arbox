function dayHeaderLabel(dateStr) {
	const d = new Date(`${dateStr}T00:00:00`);
	return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

export function WeeklyCalendar({ days, classes, onCancel }) {
	const myClasses = classes.filter((c) => c.alreadyScheduled);

	return (
		<div className="weekly-calendar-wrap">
			<div className="weekly-calendar">
				{days.map((d) => {
					const dayClasses = myClasses.filter((c) => c.date === d.date).sort((a, b) => a.time.localeCompare(b.time));
					return (
						<div className="weekly-calendar-day" key={d.date}>
							<div className="weekly-calendar-day-label">{dayHeaderLabel(d.date)}</div>
							{dayClasses.map((c) => (
								<div className={`weekly-calendar-item job-status-${c.jobStatus}`} key={c.id}>
									<button className="weekly-calendar-item-cancel" onClick={() => onCancel(c.jobId)} title="Cancel">
										×
									</button>
									<div className="weekly-calendar-item-time">{c.time}</div>
									<div className="weekly-calendar-item-name">{c.name}</div>
								</div>
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}
