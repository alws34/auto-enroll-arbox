export function QuotaStrip({ used, limit }) {
	return (
		<div className="quota-strip">
			Quota: {used}/{limit} sessions used this month
		</div>
	);
}
