import { classifyEnrollResponse } from "./classifyEnrollResponse.js";

const LEAD_MS = 150;
const SPIN_INTERVAL_MS = 5;
const DEFAULT_RETRY_INTERVAL_MS = 300;
const DEFAULT_RETRY_WINDOW_MS = 5000;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createJobScheduler({
	jobsRepo,
	credentialsRepo,
	arboxClient,
	notify,
	retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
	retryWindowMs = DEFAULT_RETRY_WINDOW_MS,
}) {
	const timers = new Map(); // jobId -> { timeout }

	async function deliverAndMark(job, status, detail) {
		const delivered = await notify(job.user_id, status, {
			classId: job.schedule_id,
			className: job.class_name,
			date: job.class_date,
			time: job.class_time,
			detail,
		});
		if (delivered) jobsRepo.markNotified(job.id);
	}

	async function boot() {
		const missedDeliveries = [];
		for (const job of jobsRepo.listPending()) {
			const fireAt = new Date(job.fire_at).getTime();
			if (fireAt <= Date.now()) {
				const detail = "Server was offline when registration opened";
				jobsRepo.updateStatus(job.id, "missed", detail);
				missedDeliveries.push(deliverAndMark(job, "missed", detail));
			} else {
				arm(job);
			}
		}
		// Await these before the catch-up scan below, so a just-marked-notified job
		// can't still show up as unnotified and get double-delivered in the same boot().
		await Promise.all(missedDeliveries);

		// Catch up on any terminal job whose notification never confirmed delivery
		// (e.g. a crash between updateStatus and notify) — never re-fires the job itself.
		for (const job of jobsRepo.listUnnotifiedTerminal()) {
			deliverAndMark(job, job.status, job.result_detail);
		}
	}

	function arm(job) {
		const delayMs = new Date(job.fire_at).getTime() - Date.now();
		const coarseDelay = Math.max(delayMs - LEAD_MS, 0);
		const timeout = setTimeout(() => spinFire(job), coarseDelay);
		timers.set(job.id, { timeout });
	}

	async function spinFire(job) {
		const target = new Date(job.fire_at).getTime();
		while (Date.now() < target) {
			await sleep(SPIN_INTERVAL_MS);
		}
		timers.delete(job.id);
		await fireJob(job);
	}

	function cancelTimer(jobId) {
		const entry = timers.get(jobId);
		if (entry) {
			clearTimeout(entry.timeout);
			timers.delete(jobId);
		}
	}

	async function fireJob(job) {
		const creds = credentialsRepo.get(job.user_id);
		if (!creds) {
			const detail = "Arbox credentials no longer configured";
			jobsRepo.updateStatus(job.id, "failed", detail);
			await deliverAndMark(job, "failed", detail);
			return;
		}

		const deadline = Date.now() + retryWindowMs;
		let outcome;
		let detail;

		while (Date.now() < deadline) {
			try {
				const { token, refreshToken } = await arboxClient.login(creds.email, creds.password);
				const membershipUserId = await arboxClient.getMembership(token, refreshToken);
				const { status, body } = await arboxClient.enroll(token, refreshToken, {
					scheduleId: job.schedule_id,
					membershipUserId,
				});
				const classification = classifyEnrollResponse(status, body);
				outcome = classification.outcome;
				detail = classification.detail;
				if (outcome !== "transient") break;
			} catch (err) {
				outcome = "transient";
				detail = err.message;
			}
			await sleep(retryIntervalMs);
		}

		const finalStatus = outcome === "success" || outcome === "waitlisted" ? outcome : "failed";
		const finalDetail = outcome === "transient" ? `Exhausted retries: ${detail}` : detail;
		jobsRepo.updateStatus(job.id, finalStatus, finalDetail);
		await deliverAndMark(job, finalStatus, finalDetail);
	}

	return { boot, arm, cancelTimer, fireJob };
}
