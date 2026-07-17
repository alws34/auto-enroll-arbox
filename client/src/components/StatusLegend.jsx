const ITEMS = [
	{ status: "pending", label: "pending" },
	{ status: "waitlisted", label: "waitlist" },
	{ status: "success", label: "entered" },
];

export function StatusLegend() {
	return (
		<div className="status-legend">
			{ITEMS.map((item) => (
				<div className="status-legend-item" key={item.status}>
					<span className={`status-legend-swatch job-status-${item.status}`} />
					{item.label}
				</div>
			))}
		</div>
	);
}
