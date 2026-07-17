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
import { bootstrapAdmin } from "./auth/bootstrapAdmin.js";
import { requireAuth, requireAdmin } from "./auth/middleware.js";
import { createArboxClient } from "./arbox/client.js";
import { createJobScheduler } from "./scheduling/engine.js";
import { createNotifier } from "./notifications/sendWebhook.js";

import { createAuthRoutes } from "./routes/authRoutes.js";
import { createCredentialsRoutes } from "./routes/credentialsRoutes.js";
import { createWebhookRoutes } from "./routes/webhookRoutes.js";
import { createScheduleRoutes } from "./routes/scheduleRoutes.js";
import { createJobsRoutes } from "./routes/jobsRoutes.js";
import { createAdminRoutes } from "./routes/adminRoutes.js";
import { createQuotaRoutes } from "./routes/quotaRoutes.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
const MAX_CLASSES_PER_MONTH = Number(process.env.MAX_CLASSES_PER_MONTH || 12);

if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");
if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY env var is required");

const db = createDb(DB_PATH);
const usersRepo = createUsersRepo(db);
const credentialsRepo = createCredentialsRepo(db, ENCRYPTION_KEY);
const webhookRepo = createWebhookRepo(db);
const jobsRepo = createJobsRepo(db);

await bootstrapAdmin({
	usersRepo,
	username: process.env.ADMIN_USERNAME,
	password: process.env.ADMIN_PASSWORD,
	maxClassesPerMonth: MAX_CLASSES_PER_MONTH,
});

const arboxClient = createArboxClient();
const notify = createNotifier({ webhookRepo });
const scheduler = createJobScheduler({ jobsRepo, credentialsRepo, arboxClient, notify });
scheduler.boot();

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ status: "OK", uptime: process.uptime() }));

app.use("/api", createAuthRoutes({ usersRepo, jwtSecret: JWT_SECRET }));

const authed = express.Router();
authed.use(requireAuth({ jwtSecret: JWT_SECRET }));
authed.use("/me/arbox-credentials", createCredentialsRoutes({ credentialsRepo }));
authed.use("/me/webhook", createWebhookRoutes({ webhookRepo }));
authed.use("/me/quota", createQuotaRoutes({ usersRepo }));
authed.use("/schedule", createScheduleRoutes({ credentialsRepo, jobsRepo, arboxClient, usersRepo }));
authed.use("/jobs", createJobsRoutes({ jobsRepo, credentialsRepo, arboxClient, scheduler }));
authed.use("/admin/users", requireAdmin, createAdminRoutes({ usersRepo, defaultMaxClassesPerMonth: MAX_CLASSES_PER_MONTH }));
app.use("/api", authed);

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
