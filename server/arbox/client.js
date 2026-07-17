import nodeFetch from "node-fetch";
import { WHITELABEL, BOX_ID, LOCATIONS_BOX_ID, BASE_URL } from "./constants.js";

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
		return { token: body.data.token, refreshToken: body.data.refreshToken, fullName: body.data.full_name };
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
		if (res.status !== 200) throw new Error(`Arbox cancel failed: ${JSON.stringify(body)}`);
		return body;
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

	return { login, getMembership, getScheduleBetweenDates, enroll, cancel, getQuota };
}
