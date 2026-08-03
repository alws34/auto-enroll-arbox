// Shared with scheduleRoutes.js and trainingRoutes.js so the two never drift
// on what counts as "booked" — Arbox is the source of truth for whether the
// user is actually registered/waitlisted; a class registered from the
// official app (not through us) has no local job row at all, so the local
// job's status is only a fallback when Arbox says nothing either way.
export function computeRegistrationStatus(c, job) {
	let status = job?.status || "none";
	if (c.user_booked) status = "success";
	else if (c.user_in_standby) status = "waitlisted";
	return status;
}
