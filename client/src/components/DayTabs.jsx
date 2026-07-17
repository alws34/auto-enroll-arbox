export function DayTabs({ days, selectedDate, onSelect }) {
	return (
		<div className="day-tabs">
			{days.map((d) => (
				<button
					key={d.date}
					className={`day-tab ${d.date === selectedDate ? "day-tab-active" : ""}`}
					onClick={() => onSelect(d.date)}
				>
					{d.label}
				</button>
			))}
		</div>
	);
}
