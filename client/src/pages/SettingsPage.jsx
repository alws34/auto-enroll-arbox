import { useEffect, useState } from "react";
import { api } from "../api.js";

export function SettingsPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [webhookUrl, setWebhookUrl] = useState("");
	const [maxClassesPerMonth, setMaxClassesPerMonth] = useState("");
	const [status, setStatus] = useState(null);

	useEffect(() => {
		api.getCredentials().then((c) => setEmail(c.email || ""));
		api.getWebhook().then((w) => setWebhookUrl(w.webhookUrl || ""));
		api.getQuota().then((q) => setMaxClassesPerMonth(String(q.maxClassesPerMonth)));
	}, []);

	async function saveCredentials(e) {
		e.preventDefault();
		try {
			await api.setCredentials(email, password);
			setPassword("");
			setStatus("Gym credentials saved.");
		} catch (err) {
			setStatus(err.message);
		}
	}

	async function saveWebhook(e) {
		e.preventDefault();
		try {
			await api.setWebhook(webhookUrl);
			setStatus("Webhook saved.");
		} catch (err) {
			setStatus(err.message);
		}
	}

	async function saveQuota(e) {
		e.preventDefault();
		try {
			await api.setQuota(Number(maxClassesPerMonth));
			setStatus("Monthly quota saved.");
		} catch (err) {
			setStatus(err.message);
		}
	}

	return (
		<div className="settings-page">
			<h2>Gym credentials</h2>
			<form onSubmit={saveCredentials}>
				<input className="mock-input" placeholder="Arbox email" value={email} onChange={(e) => setEmail(e.target.value)} />
				<input
					className="mock-input"
					type="password"
					placeholder="Arbox password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<button className="btn btn-primary" type="submit">
					Save
				</button>
			</form>

			<h2>Webhook</h2>
			<form onSubmit={saveWebhook}>
				<input
					className="mock-input"
					placeholder="https://your-webhook-url"
					value={webhookUrl}
					onChange={(e) => setWebhookUrl(e.target.value)}
				/>
				<button className="btn btn-primary" type="submit">
					Save
				</button>
			</form>

			<h2>Monthly quota</h2>
			<form onSubmit={saveQuota}>
				<input
					className="mock-input"
					type="number"
					min="1"
					placeholder="Sessions per month on your plan"
					value={maxClassesPerMonth}
					onChange={(e) => setMaxClassesPerMonth(e.target.value)}
				/>
				<button className="btn btn-primary" type="submit">
					Save
				</button>
			</form>

			{status && <p className="page-status">{status}</p>}
		</div>
	);
}
