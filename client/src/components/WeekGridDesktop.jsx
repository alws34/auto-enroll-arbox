// Dense weekly calendar grid for desktop — every class in the week, not just
// ones you've already booked (unlike WeeklyCalendar, which is the "My
// schedule" strip of booked classes only). Styled after the box's own יומן
// on the White City site: one column per day, classes stacked by time.
// Hidden on mobile via CSS (.week-grid-desktop) — SchedulePage keeps the
// existing day-tabs + list flow for narrow viewports.
export function WeekGridDesktop({ days, classes, onSelect }) {
	return (
		<div className="week-grid-desktop">
			{days.map((d) => {
				const dayClasses = classes.filter((c) => c.date === d.date).sort((a, b) => a.time.localeCompare(b.time));
				return (
					<div className="week-grid-day" key={d.date}>
						<div className="week-grid-day-label">{d.label}</div>
						<div className="week-grid-day-items">
							{dayClasses.map((c) => (
								<button
									key={c.id}
									className={`week-grid-item ${c.alreadyScheduled ? `job-status-${c.jobStatus}` : "week-grid-item-open"}`}
									onClick={() => onSelect(c)}
								>
									<div className="week-grid-item-time">
										{c.time}–{c.endTime}
									</div>
									<div className="week-grid-item-name">{c.name}</div>
									<div className="week-grid-item-meta">
										{c.coach || "—"} · {c.bookedCount}/{c.maxUsers}
									</div>
								</button>
							))}
							{dayClasses.length === 0 && <div className="week-grid-empty">—</div>}
						</div>
					</div>
				);
			})}
		</div>
	);
}
