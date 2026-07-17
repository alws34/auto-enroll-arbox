const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function classifyEnrollResponse(status, body) {
	if (status === 200) {
		const data = body?.data;
		if (data?.user_booked) return { outcome: "success", detail: null };
		if (data?.user_in_standby) return { outcome: "waitlisted", detail: null };
		return { outcome: "terminal", detail: "Unexpected 200 response with no booking confirmation" };
	}

	if (TRANSIENT_STATUSES.has(status)) {
		return { outcome: "transient", detail: `HTTP ${status}` };
	}

	const messages = body?.error?.messageToUser;
	let detail;
	if (Array.isArray(messages) && messages.length > 0) {
		detail = messages.map((m) => m.message).filter(Boolean).join("; ");
	}
	detail = detail || body?.error?.message || body?.message || `HTTP ${status}`;

	return { outcome: "terminal", detail };
}
