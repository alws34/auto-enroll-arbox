const BASE = "/api";

async function request(path, options = {}) {
	const res = await fetch(`${BASE}${path}`, {
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		...options,
	});
	if (res.status === 401) {
		window.location.href = "/login";
		throw new Error("Not authenticated");
	}
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `Request failed: ${res.status}`);
	}
	if (res.status === 204) return null;
	return res.json();
}

export const api = {
	login: (username, password) => request("/login", { method: "POST", body: JSON.stringify({ username, password }) }),
	loginTwoFactor: (pendingToken, code) =>
		request("/login/2fa", { method: "POST", body: JSON.stringify({ pendingToken, code }) }),
	logout: () => request("/logout", { method: "POST" }),
	getMe: () => request("/me"),
	get2FA: () => request("/me/2fa"),
	setup2FA: () => request("/me/2fa/setup", { method: "POST" }),
	confirm2FA: (code) => request("/me/2fa/confirm", { method: "POST", body: JSON.stringify({ code }) }),
	disable2FA: (code) => request("/me/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
	getSchedule: (days = 7, from) => request(`/schedule?days=${days}${from ? `&from=${from}` : ""}`),
	getCredentials: () => request("/me/arbox-credentials"),
	setCredentials: (email, password) => request("/me/arbox-credentials", { method: "PUT", body: JSON.stringify({ email, password }) }),
	getWebhook: () => request("/me/webhook"),
	setWebhook: (webhookUrl) => request("/me/webhook", { method: "PUT", body: JSON.stringify({ webhookUrl }) }),
	getQuota: () => request("/me/quota"),
	setQuota: (maxClassesPerMonth) => request("/me/quota", { method: "PUT", body: JSON.stringify({ maxClassesPerMonth }) }),
	getNotificationPrefs: () => request("/me/notifications"),
	setNotificationPrefs: (email, emailNotificationsEnabled) =>
		request("/me/notifications", { method: "PUT", body: JSON.stringify({ email, emailNotificationsEnabled }) }),
	sendTestEmail: () => request("/me/notifications/test", { method: "POST" }),
	scheduleJob: (scheduleId, classDate) => request("/jobs", { method: "POST", body: JSON.stringify({ scheduleId, classDate }) }),
	cancelJob: (id) => request(`/jobs/${id}`, { method: "DELETE" }),
	cancelArboxRegistration: (scheduleId, classDate) =>
		request(`/schedule/${scheduleId}?classDate=${classDate}`, { method: "DELETE" }),
	listUsers: () => request("/admin/users"),
	createUser: (username, email) => request("/admin/users", { method: "POST", body: JSON.stringify({ username, email }) }),
	sendPasswordReset: (userId) => request(`/admin/users/${userId}/send-reset`, { method: "POST" }),
	getSenderEmail: () => request("/admin/settings/sender-email"),
	setSenderEmail: (senderEmail) => request("/admin/settings/sender-email", { method: "PUT", body: JSON.stringify({ senderEmail }) }),
	resetPassword: (token, password) => request(`/password-reset/${token}`, { method: "POST", body: JSON.stringify({ password }) }),
	listReminders: (scheduleId) => request(`/reminders?scheduleId=${scheduleId}`),
	addReminder: (classInfo, minutesBefore) =>
		request("/reminders", {
			method: "POST",
			body: JSON.stringify({
				scheduleId: classInfo.id,
				classDate: classInfo.date,
				classTime: classInfo.time,
				className: classInfo.name,
				minutesBefore,
			}),
		}),
	deleteReminder: (id) => request(`/reminders/${id}`, { method: "DELETE" }),
	getWorkout: (workoutId) => request(`/workout/${workoutId}`),
};
