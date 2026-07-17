import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export function LoginPage() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);
	const navigate = useNavigate();

	async function handleSubmit(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.login(username, password);
			navigate("/");
		} catch (err) {
			setError(err.message);
		}
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
