function toGCalUtc(iso) {
	return iso.replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function buildGoogleCalendarUrl({ title, startUtc, endUtc, details, location }) {
	const params = new URLSearchParams({
		action: "TEMPLATE",
		text: title,
		dates: `${toGCalUtc(startUtc)}/${toGCalUtc(endUtc)}`,
		details: details || "",
		location: location || "",
	});
	return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
