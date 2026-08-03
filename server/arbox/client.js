import nodeFetch from "node-fetch";
import { WHITELABEL, BOX_ID, LOCATIONS_BOX_ID, BASE_URL } from "./constants.js";

// Arbox is inconsistent about the shape of error.messageToUser — sometimes a
// plain string (e.g. cancel: "class has already begun"), sometimes an array
// of {message} objects (e.g. enroll: category frequency limit). Handle both.
export function arboxErrorMessage(body) {
	const m = body?.error?.messageToUser;
	if (typeof m === "string" && m) return m;
	if (Array.isArray(m) && m.length > 0) {
		const joined = m.map((x) => x.message).filter(Boolean).join("; ");
		if (joined) return joined;
	}
	return body?.error?.message || body?.message || "Request failed";
}

// A user can have more than one active membership at once (e.g. a recurring
// plan plus a leftover single-session credit). Each booking is tied to a
// specific one via booked_users[].membership_user_fk — "first active
// membership" (used when creating a booking, before it exists) is the wrong
// thing to pass when *cancelling* an existing one: Arbox silently no-ops
// (200, nothing actually removed) if the membership_user_id doesn't match
// the booking's real owner.
export function findMembershipForBooking(classObj, arboxUserId) {
	const entry = (classObj?.booked_users || []).find((u) => u.id === arboxUserId);
	return entry?.membership_user_fk ?? null;
}

function authHeaders(token, refreshToken) {
	return {
		Accept: "application/json, text/plain, */*",
		"Content-Type": "application/json",
		whitelabel: WHITELABEL,
		...(token ? { accesstoken: token } : {}),
		...(refreshToken ? { refreshtoken: refreshToken } : {}),
	};
}

export function createArboxClient({ fetchImpl = nodeFetch } = {}) {
	async function login(email, password) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/user/login`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ email, password }),
		});
		const body = await res.json();
		if (res.status !== 200) {
			throw new Error(`Arbox login failed: ${JSON.stringify(body)}`);
		}
		return {
			token: body.data.token,
			refreshToken: body.data.refreshToken,
			fullName: body.data.full_name,
			arboxUserId: body.data.id,
		};
	}

	async function getMembership(token, refreshToken) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/boxes/${BOX_ID}/memberships/1`, {
			method: "GET",
			headers: authHeaders(token, refreshToken),
		});
		const body = await res.json();
		const active = (body.data || []).find((m) => m.active === 1);
		if (!active) throw new Error("No active Arbox membership found");
		return active.id;
	}

	async function getScheduleBetweenDates(token, refreshToken, from, to) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/schedule/betweenDates`, {
			method: "POST",
			headers: authHeaders(token, refreshToken),
			body: JSON.stringify({ from, locations_box_id: LOCATIONS_BOX_ID, to, boxes_id: BOX_ID }),
		});
		const body = await res.json();
		if (res.status !== 200) throw new Error(`Arbox schedule fetch failed: ${JSON.stringify(body)}`);
		return body.data;
	}

	async function enroll(token, refreshToken, { scheduleId, membershipUserId }) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/scheduleUser/insert`, {
			method: "POST",
			headers: authHeaders(token, refreshToken),
			body: JSON.stringify({ extras: null, membership_user_id: membershipUserId, schedule_id: scheduleId }),
		});
		const body = await res.json();
		return { status: res.status, body };
	}

	async function cancel(token, refreshToken, { scheduleId, membershipUserId }) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/scheduleUser/delete`, {
			method: "POST",
			headers: authHeaders(token, refreshToken),
			body: JSON.stringify({ schedule_id: scheduleId, membership_user_id: membershipUserId }),
		});
		const body = await res.json();
		return { status: res.status, body };
	}

	async function getQuota(token, refreshToken) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/user/feed`, {
			method: "GET",
			headers: authHeaders(token, refreshToken),
		});
		const body = await res.json();
		const results = body?.scheduleUserStatus?.results || {};
		const used = Number(results.past || 0) + Number(results.future || 0);
		return { used };
	}

	// The gym's coaches attach a "WOD" (workout of the day) to a class via
	// Arbox's own logbook feature, keyed by workout_id (present on the raw
	// schedule object from getScheduleBetweenDates, shared across every
	// session of the same class on the same day — not per individual
	// booking). This isn't exposed by this box's booking widget at all and
	// isn't in any published Arbox API docs; reverse-engineered by capturing
	// the official mobile app's traffic. The response is deeply nested
	// (data: [[[ {...} ]]]) — presumably to allow multiple parts/rounds per
	// workout — so we flatten it fully.
	async function getWorkoutLogbook(token, refreshToken, workoutId) {
		const res = await fetchImpl(`${BASE_URL}/api/v2/logbook/workout/${workoutId}`, {
			method: "GET",
			headers: authHeaders(token, refreshToken),
		});
		const body = await res.json();
		if (res.status !== 200) throw new Error(`Arbox workout fetch failed: ${JSON.stringify(body)}`);
		const entries = (body?.data || []).flat(Infinity).filter(Boolean);
		return entries.map((e) => ({
			section: e.box_sections?.name || null,
			text: e.comment || "",
			date: e.name || null,
		}));
	}

	return { login, getMembership, getScheduleBetweenDates, enroll, cancel, getQuota, getWorkoutLogbook };
}
