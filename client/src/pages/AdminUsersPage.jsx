import { useEffect, useState } from "react";
import { api } from "../api.js";

export function AdminUsersPage() {
	const [users, setUsers] = useState([]);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [email, setEmail] = useState("");
	const [senderEmail, setSenderEmail] = useState("");
	const [error, setError] = useState(null);
	const [status, setStatus] = useState(null);

	function load() {
		api.listUsers().then(setUsers);
	}

	useEffect(() => {
		load();
		api.getSenderEmail().then((s) => setSenderEmail(s.senderEmail || ""));
	}, []);

	async function handleCreate(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.createUser(username, password, email || undefined);
			setUsername("");
			setPassword("");
			setEmail("");
			load();
		} catch (err) {
			setError(err.message);
		}
	}

	async function handleSaveSenderEmail(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.setSenderEmail(senderEmail);
			setStatus("Sender email saved.");
		} catch (err) {
			setError(err.message);
		}
	}

	async function handleSendReset(userId) {
		setError(null);
		setStatus(null);
		try {
			await api.sendPasswordReset(userId);
			setStatus("Reset link emailed.");
		} catch (err) {
			setError(err.message);
		}
	}

	return (
		<div className="admin-users-page">
			<h2>Notification sender email</h2>
			<form onSubmit={handleSaveSenderEmail}>
				<input
					className="mock-input"
					placeholder="alws34+gymnotifyer@gmail.com"
					value={senderEmail}
					onChange={(e) => setSenderEmail(e.target.value)}
				/>
				<button className="btn btn-primary" type="submit">
					Save
				</button>
			</form>

			<h2>Users</h2>
			<ul className="admin-user-list">
				{users.map((u) => (
					<li key={u.id}>
						<span>
							{u.username} {u.is_admin ? "(admin)" : ""} {u.email ? `· ${u.email}` : ""}
						</span>
						<button className="btn btn-secondary" onClick={() => handleSendReset(u.id)}>
							Send reset link
						</button>
					</li>
				))}
			</ul>

			<h3>Add user</h3>
			<form onSubmit={handleCreate}>
				<input className="mock-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
				<input
					className="mock-input"
					type="password"
					placeholder="Temporary password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<input
					className="mock-input"
					placeholder="Notification email (optional)"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<button className="btn btn-primary" type="submit">
					Create
				</button>
			</form>
			{status && <p className="page-status">{status}</p>}
			{error && <p className="page-error">{error}</p>}
		</div>
	);
}
