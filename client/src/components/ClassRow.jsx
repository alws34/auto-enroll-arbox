function formatCountdown(fireAtIso) {
	const diffMs = new Date(fireAtIso).getTime() - Date.now();
	if (diffMs <= 0) return "registration open now";
	const hours = Math.floor(diffMs / 3600000);
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	const minutes = Math.floor((diffMs % 3600000) / 60000);
	if (days > 0) return `opens in ${days}d ${remHours}h`;
	if (hours > 0) return `opens in ${hours}h ${minutes}m`;
	return `opens in ${minutes}m`;
}

export function ClassRow({ classInfo, onSchedule, onCancel }) {
	const full = classInfo.bookedCount >= classInfo.maxUsers;
	return (
		<div className="class-row">
			<div className="class-row-main">
				<div className="class-row-time">{classInfo.time}</div>
				<div className="class-row-name">{classInfo.name}</div>
				<div className="class-row-meta">
					{classInfo.coach || "—"} · {classInfo.bookedCount}/{classInfo.maxUsers} {full ? "(full)" : ""}
				</div>
				<div className="class-row-status">{formatCountdown(classInfo.fireAt)}</div>
				{classInfo.alreadyScheduled && (
					<div className={`job-status-badge job-status-${classInfo.jobStatus}`}>{classInfo.jobStatus}</div>
				)}
			</div>
			{classInfo.alreadyScheduled ? (
				<button className="btn btn-secondary" onClick={() => onCancel(classInfo.jobId)}>
					Cancel
				</button>
			) : (
				<button className="btn btn-primary" onClick={() => onSchedule(classInfo)}>
					Schedule
				</button>
			)}
		</div>
	);
}
