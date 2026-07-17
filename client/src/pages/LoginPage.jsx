import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export function LoginPage() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [pendingToken, setPendingToken] = useState(null);
	const [error, setError] = useState(null);
	const navigate = useNavigate();

	async function handleSubmit(e) {
		e.preventDefault();
		setError(null);
		try {
			const res = await api.login(username, password);
			if (res.requiresTwoFactor) {
				setPendingToken(res.pendingToken);
				return;
			}
			navigate("/");
		} catch (err) {
			setError(err.message);
		}
	}

	async function handleTwoFactorSubmit(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.loginTwoFactor(pendingToken, code);
			navigate("/");
		} catch (err) {
			setError(err.message);
		}
	}

	if (pendingToken) {
		return (
			<form className="login-form" onSubmit={handleTwoFactorSubmit}>
				<h1>Enter your 2FA code</h1>
				<input
					className="mock-input"
					placeholder="6-digit code"
					value={code}
					onChange={(e) => setCode(e.target.value)}
					autoFocus
				/>
				{error && <p className="page-error">{error}</p>}
				<button className="btn btn-primary" type="submit">
					Verify
				</button>
			</form>
		);
	}

	return (
		<form className="login-form" onSubmit={handleSubmit}>
			<h1>Arbox Auto-Enroll</h1>
			<input className="mock-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
			<input
				className="mock-input"
				type="password"
				placeholder="Password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			{error && <p className="page-error">{error}</p>}
			<button className="btn btn-primary" type="submit">
				Log in
			</button>
		</form>
	);
}
