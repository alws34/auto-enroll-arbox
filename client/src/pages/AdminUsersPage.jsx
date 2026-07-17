import { useEffect, useState } from "react";
import { api } from "../api.js";

export function AdminUsersPage() {
	const [users, setUsers] = useState([]);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);

	function load() {
		api.listUsers().then(setUsers);
	}

	useEffect(load, []);

	async function handleCreate(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.createUser(username, password, false);
			setUsername("");
			setPassword("");
			load();
		} catch (err) {
			setError(err.message);
		}
	}

	return (
		<div className="admin-users-page">
			<h2>Users</h2>
			<ul>
				{users.map((u) => (
					<li key={u.id}>
						{u.username} {u.is_admin ? "(admin)" : ""}
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
				<button className="btn btn-primary" type="submit">
					Create
				</button>
			</form>
			{error && <p className="page-error">{error}</p>}
		</div>
	);
}
