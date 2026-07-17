export function createCombinedNotifier(notifiers) {
	return async function notify(userId, event, payload) {
		const results = await Promise.all(notifiers.map((notifier) => notifier(userId, event, payload)));
		return results.every(Boolean);
	};
}
