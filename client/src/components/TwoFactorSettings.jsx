import { useEffect, useState } from "react";
import { api } from "../api.js";

export function TwoFactorSettings() {
	const [enabled, setEnabled] = useState(false);
	const [setupData, setSetupData] = useState(null);
	const [code, setCode] = useState("");
	const [status, setStatus] = useState(null);
	const [error, setError] = useState(null);

	function load() {
		api.get2FA().then((r) => setEnabled(r.enabled));
	}

	useEffect(load, []);

	async function handleStartSetup() {
		setError(null);
		try {
			const data = await api.setup2FA();
			setSetupData(data);
		} catch (err) {
			setError(err.message);
		}
	}

	async function handleConfirm(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.confirm2FA(code);
			setSetupData(null);
			setCode("");
			setStatus("Two-factor authentication enabled.");
			load();
		} catch (err) {
			setError(err.message);
		}
	}

	async function handleDisable(e) {
		e.preventDefault();
		setError(null);
		try {
			await api.disable2FA(code);
			setCode("");
			setStatus("Two-factor authentication disabled.");
			load();
		} catch (err) {
			setError(err.message);
		}
	}

	if (enabled) {
		return (
			<div>
				<p className="modal-note">Two-factor authentication is enabled.</p>
				<form onSubmit={handleDisable}>
					<input
						className="mock-input"
						placeholder="6-digit code to disable"
						value={code}
						onChange={(e) => setCode(e.target.value)}
					/>
					<button className="btn btn-danger" type="submit">
						Disable 2FA
					</button>
				</form>
				{status && <p className="page-status">{status}</p>}
				{error && <p className="page-error">{error}</p>}
			</div>
		);
	}

	if (setupData) {
		return (
			<div>
				<p className="modal-note">Scan this with Google Authenticator (or any TOTP app), then enter the code it shows.</p>
				<img src={setupData.qrCodeDataUrl} alt="2FA QR code" className="totp-qr" />
				<p className="modal-note">Manual entry key: {setupData.secret}</p>
				<form onSubmit={handleConfirm}>
					<input
						className="mock-input"
						placeholder="6-digit code"
						value={code}
						onChange={(e) => setCode(e.target.value)}
					/>
					<button className="btn btn-primary" type="submit">
						Confirm
					</button>
				</form>
				{error && <p className="page-error">{error}</p>}
			</div>
		);
	}

	return (
		<div>
			<p className="modal-note">Two-factor authentication is off.</p>
			<button className="btn btn-primary" onClick={handleStartSetup}>
				Enable 2FA
			</button>
			{error && <p className="page-error">{error}</p>}
		</div>
	);
}
