function dayHeaderLabel(dateStr) {
	const d = new Date(`${dateStr}T00:00:00`);
	return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

export function WeeklyCalendar({ days, classes, onSelect }) {
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
								<button className={`weekly-calendar-item job-status-${c.jobStatus}`} key={c.id} onClick={() => onSelect(c)}>
									<div className="weekly-calendar-item-time">
										{c.time}–{c.endTime}
									</div>
									<div className="weekly-calendar-item-name">{c.name}</div>
								</button>
							))}
							{dayClasses.length === 0 && <div className="weekly-calendar-empty">—</div>}
						</div>
					);
				})}
			</div>
		</div>
	);
}
