import nodeFetch from "node-fetch";

export function createNotifier({ webhookRepo, fetchImpl = nodeFetch }) {
	return async function notify(userId, event, payload) {
		const webhookUrl = webhookRepo.get(userId);
		if (!webhookUrl) return;
		try {
			await fetchImpl(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ event, ...payload }),
			});
		} catch (err) {
			console.log(`Webhook notification failed for user ${userId}:`, err.message);
		}
	};
}
