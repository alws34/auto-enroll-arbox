import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { LoginPage } from "./pages/LoginPage.jsx";
import { SchedulePage } from "./pages/SchedulePage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { AdminUsersPage } from "./pages/AdminUsersPage.jsx";

function Nav({ onLogout }) {
	return (
		<nav className="app-nav">
			<Link to="/">Schedule</Link>
			<Link to="/settings">Settings</Link>
			<Link to="/admin">Users</Link>
			<button className="btn-link" onClick={onLogout}>
				Log out
			</button>
		</nav>
	);
}

function AppShell() {
	const navigate = useNavigate();

	async function handleLogout() {
		await api.logout();
		navigate("/login");
	}

	return (
		<>
			<Nav onLogout={handleLogout} />
			<main className="app-main">
				<Routes>
					<Route path="/" element={<SchedulePage />} />
					<Route path="/settings" element={<SettingsPage />} />
					<Route path="/admin" element={<AdminUsersPage />} />
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
				<Route path="/*" element={<AppShell />} />
			</Routes>
		</BrowserRouter>
	);
}
