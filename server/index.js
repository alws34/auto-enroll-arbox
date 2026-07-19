import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDb } from "./db/index.js";
import { createUsersRepo } from "./repositories/usersRepo.js";
import { createCredentialsRepo } from "./repositories/credentialsRepo.js";
import { createWebhookRepo } from "./repositories/webhookRepo.js";
import { createJobsRepo } from "./repositories/jobsRepo.js";
import { createPasswordResetRepo } from "./repositories/passwordResetRepo.js";
import { createAppSettingsRepo } from "./repositories/appSettingsRepo.js";
import { createRemindersRepo } from "./repositories/remindersRepo.js";
import { createTotpRepo } from "./repositories/totpRepo.js";
import { bootstrapAdmin } from "./auth/bootstrapAdmin.js";
import { requireAuth, requireAdmin } from "./auth/middleware.js";
import { createArboxClient } from "./arbox/client.js";
import { createJobScheduler } from "./scheduling/engine.js";
import { createReminderEngine } from "./scheduling/reminderEngine.js";
import { createNotifier as createWebhookNotifier } from "./notifications/sendWebhook.js";
import { createEmailNotifier, createGmailTransporter } from "./notifications/sendEmail.js";
import { createCombinedNotifier } from "./notifications/notify.js";

import { createAuthRoutes } from "./routes/authRoutes.js";
import { createCredentialsRoutes } from "./routes/credentialsRoutes.js";
import { createWebhookRoutes } from "./routes/webhookRoutes.js";
import { createScheduleRoutes } from "./routes/scheduleRoutes.js";
import { createJobsRoutes } from "./routes/jobsRoutes.js";
import { createAdminRoutes } from "./routes/adminRoutes.js";
import { createAdminSettingsRoutes, SENDER_EMAIL_KEY } from "./routes/adminSettingsRoutes.js";
import { createQuotaRoutes } from "./routes/quotaRoutes.js";
import { createNotificationPrefsRoutes } from "./routes/notificationPrefsRoutes.js";
import { createPasswordResetRoutes } from "./routes/passwordResetRoutes.js";
import { createRemindersRoutes } from "./routes/remindersRoutes.js";
import { createTwoFactorRoutes } from "./routes/twoFactorRoutes.js";

dotenv.config();

process.on("unhandledRejection", (reason) => {
	console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
	console.error("Uncaught exception:", err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
const MAX_CLASSES_PER_MONTH = Number(process.env.MAX_CLASSES_PER_MONTH || 12);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");
if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY env var is required");

const db = createDb(DB_PATH);
const usersRepo = createUsersRepo(db);
const credentialsRepo = createCredentialsRepo(db, ENCRYPTION_KEY);
const webhookRepo = createWebhookRepo(db);
const jobsRepo = createJobsRepo(db);
const passwordResetRepo = createPasswordResetRepo(db);
const appSettingsRepo = createAppSettingsRepo(db);
const remindersRepo = createRemindersRepo(db);
const totpRepo = createTotpRepo(db, ENCRYPTION_KEY);

await bootstrapAdmin({
	usersRepo,
	username: process.env.ADMIN_USERNAME,
	password: process.env.ADMIN_PASSWORD,
	maxClassesPerMonth: MAX_CLASSES_PER_MONTH,
});

const fromEmailProvider = () => appSettingsRepo.get(SENDER_EMAIL_KEY, GMAIL_USER);
const transporter = GMAIL_USER && GMAIL_APP_PASSWORD ? createGmailTransporter({ user: GMAIL_USER, appPassword: GMAIL_APP_PASSWORD }) : null;
if (!transporter) {
	console.log("GMAIL_USER/GMAIL_APP_PASSWORD not set — email notifications and password-reset emails are disabled.");
}

const arboxClient = createArboxClient();
const webhookNotifier = createWebhookNotifier({ webhookRepo });
const emailNotifier = transporter
	? createEmailNotifier({ transporter, usersRepo, fromEmailProvider })
	: async () => true;
const notify = createCombinedNotifier([webhookNotifier, emailNotifier]);
const scheduler = createJobScheduler({ jobsRepo, credentialsRepo, arboxClient, notify });
await scheduler.boot();

const reminderEngine = createReminderEngine({ remindersRepo, notify });
reminderEngine.start();

const app = express();
app.set("trust proxy", true);
app.set("etag", false);
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
	if (!req.path.startsWith("/api")) return next();
	res.setHeader("Cache-Control", "no-store");
	const start = Date.now();
	res.on("finish", () => {
		console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
	});
	next();
});

app.get("/api/health", (req, res) => res.json({ status: "OK", uptime: process.uptime() }));

app.use("/api", createAuthRoutes({ usersRepo, jwtSecret: JWT_SECRET, totpRepo }));
app.use("/api/password-reset", createPasswordResetRoutes({ passwordResetRepo, usersRepo }));

const authed = express.Router();
authed.use(requireAuth({ jwtSecret: JWT_SECRET }));
authed.use("/me/arbox-credentials", createCredentialsRoutes({ credentialsRepo }));
authed.use("/me/webhook", createWebhookRoutes({ webhookRepo }));
authed.use("/me/quota", createQuotaRoutes({ usersRepo }));
authed.use("/me/notifications", createNotificationPrefsRoutes({ usersRepo, transporter, fromEmailProvider }));
authed.use("/schedule", createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, usersRepo }));
authed.use("/jobs", createJobsRoutes({ jobsRepo, credentialsRepo, arboxClient, scheduler }));
authed.use("/reminders", createRemindersRoutes({ remindersRepo }));
authed.use("/me/2fa", createTwoFactorRoutes({ usersRepo, totpRepo }));
authed.use(
	"/admin/users",
	requireAdmin,
	createAdminRoutes({
		usersRepo,
		defaultMaxClassesPerMonth: MAX_CLASSES_PER_MONTH,
		passwordResetRepo,
		transporter,
		fromEmailProvider,
		appBaseUrl: APP_BASE_URL,
	})
);
authed.use(
	"/admin/settings",
	requireAdmin,
	createAdminSettingsRoutes({ appSettingsRepo, defaultSenderEmail: GMAIL_USER || "" })
);
app.use("/api", authed);

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

// Must be registered last — catches errors forwarded via next(err) from asyncHandler-wrapped
// routes, which would otherwise hang the request with no response and no log line at all.
app.use((err, req, res, next) => {
	console.error(`${req.method} ${req.originalUrl} ERROR:`, err);
	if (res.headersSent) return next(err);
	res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
