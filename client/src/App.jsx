import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { LoginPage } from "./pages/LoginPage.jsx";
import { SchedulePage } from "./pages/SchedulePage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { AdminUsersPage } from "./pages/AdminUsersPage.jsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.jsx";

function Nav({ isAdmin, onLogout }) {
	return (
		<nav className="app-nav">
			<Link to="/">Schedule</Link>
			<Link to="/settings">Settings</Link>
			{isAdmin && <Link to="/admin">Users</Link>}
			<button className="btn-link" onClick={onLogout}>
				Log out
			</button>
		</nav>
	);
}

function AppShell() {
	const navigate = useNavigate();
	const [me, setMe] = useState(null);

	useEffect(() => {
		api.getMe().then(setMe);
	}, []);

	async function handleLogout() {
		await api.logout();
		navigate("/login");
	}

	if (!me) return null;

	return (
		<>
			<Nav isAdmin={me.isAdmin} onLogout={handleLogout} />
			<main className="app-main">
				<Routes>
					<Route path="/" element={<SchedulePage />} />
					<Route path="/settings" element={<SettingsPage />} />
					<Route path="/admin" element={me.isAdmin ? <AdminUsersPage /> : <Navigate to="/" replace />} />
				</Routes>
			</main>
		</>
	);
}

export function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/reset-password" element={<ResetPasswordPage />} />
				<Route path="/*" element={<AppShell />} />
			</Routes>
		</BrowserRouter>
	);
}
