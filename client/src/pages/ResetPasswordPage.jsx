import { useState } from "react";
import { api } from "../api.js";

export function ResetPasswordPage() {
	const token = new URLSearchParams(window.location.search).get("token");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [status, setStatus] = useState(null);
	const [done, setDone] = useState(false);

	async function handleSubmit(e) {
		e.preventDefault();
		setStatus(null);
		if (password !== confirm) {
			setStatus("Passwords don't match.");
			return;
		}
		try {
			await api.resetPassword(token, password);
			setDone(true);
		} catch (err) {
			setStatus(err.message);
		}
	}

	if (!token) return <p className="page-status page-error">Missing reset token.</p>;
	if (done) return <p className="page-status">Password updated. You can log in now.</p>;

	return (
		<form className="login-form" onSubmit={handleSubmit}>
			<h1>Set a new password</h1>
			<input
				className="mock-input"
				type="password"
				placeholder="New password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			<input
				className="mock-input"
				type="password"
				placeholder="Confirm new password"
				value={confirm}
				onChange={(e) => setConfirm(e.target.value)}
			/>
			{status && <p className="page-error">{status}</p>}
			<button className="btn btn-primary" type="submit">
				Set password
			</button>
		</form>
	);
}
