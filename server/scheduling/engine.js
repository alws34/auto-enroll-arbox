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

	function boot() {
		for (const job of jobsRepo.listPending()) {
			const fireAt = new Date(job.fire_at).getTime();
			if (fireAt <= Date.now()) {
				jobsRepo.updateStatus(job.id, "missed", "Server was offline when registration opened");
				notify(job.user_id, "missed", { classId: job.schedule_id, className: job.class_name, date: job.class_date, time: job.class_time });
			} else {
				arm(job);
			}
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
			jobsRepo.updateStatus(job.id, "failed", "Arbox credentials no longer configured");
			await notify(job.user_id, "failed", { classId: job.schedule_id, className: job.class_name, date: job.class_date, time: job.class_time, detail: "Arbox credentials no longer configured" });
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
		await notify(job.user_id, finalStatus, {
			classId: job.schedule_id,
			className: job.class_name,
			date: job.class_date,
			time: job.class_time,
			detail: finalDetail,
		});
	}

	return { boot, arm, cancelTimer, fireJob };
}
