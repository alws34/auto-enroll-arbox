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
	logout: () => request("/logout", { method: "POST" }),
	getSchedule: (days = 7) => request(`/schedule?days=${days}`),
	getCredentials: () => request("/me/arbox-credentials"),
	setCredentials: (email, password) => request("/me/arbox-credentials", { method: "PUT", body: JSON.stringify({ email, password }) }),
	getWebhook: () => request("/me/webhook"),
	setWebhook: (webhookUrl) => request("/me/webhook", { method: "PUT", body: JSON.stringify({ webhookUrl }) }),
	scheduleJob: (scheduleId, classDate) => request("/jobs", { method: "POST", body: JSON.stringify({ scheduleId, classDate }) }),
	cancelJob: (id) => request(`/jobs/${id}`, { method: "DELETE" }),
	listUsers: () => request("/admin/users"),
	createUser: (username, password, isAdmin) => request("/admin/users", { method: "POST", body: JSON.stringify({ username, password, isAdmin }) }),
};
