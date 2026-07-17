
# Auto Enroll - Arbox app

A multi-user web app that auto-enrolls into Arbox gym classes at the exact
moment registration opens — no more racing a browser tab at the exact second
and losing the spot.

#### Wait, what?

Browse the upcoming schedule (day by day, mobile-friendly), press
**Schedule** on a class, and the app logs in and hits enroll for you at the
precise second registration opens for that class (Arbox exposes this window
per class — 48 or 72 hours ahead, depending on the class). If the class is
full, an accepted waitlist spot still counts as success.

Each person (you, your training partner) has their own login, their own
Arbox credentials (stored encrypted), and their own schedule/jobs — fully
isolated.

## Deploying

This is a single Docker Compose stack: the app container (Node/Express API +
built React frontend, SQLite for storage) plus an optional `cloudflared`
sidecar for exposing it to the internet through a Cloudflare Tunnel.

### 1. Configure environment

```bash
cp sample.env .env
```

Fill in `.env`:

| Variable | What it is |
|---|---|
| `JWT_SECRET` | Random secret for signing session cookies. Generate with `openssl rand -hex 32`. |
| `ENCRYPTION_KEY` | Random secret used to encrypt stored Arbox passwords at rest. Generate with `openssl rand -hex 32`. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Your login for the first (admin) account — auto-created on first boot. |
| `ARBOX_WHITELABEL` / `ARBOX_BOX_ID` / `ARBOX_LOCATIONS_BOX_ID` | Already set correctly for hypr-training / CrossFit White City — leave as-is unless you're pointing this at a different Arbox box. |
| `MAX_CLASSES_PER_MONTH` | Default monthly quota assigned to new accounts (yours on bootstrap, and anyone the admin creates). Each user can change their own in Settings afterward — membership plans differ per person. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Only needed if exposing via Cloudflare Tunnel — see below. |

Note: each user's own Arbox email/password is entered later, in the app's
Settings page — not in `.env`. `.env` only holds app-level config.

### 2. Build and run

```bash
docker compose up -d --build
```

The app is now on `http://<server-ip>:5000`. Log in with
`ADMIN_USERNAME`/`ADMIN_PASSWORD`, then use the Users page (admin only) to
create an account for anyone else training with you.

### 3. Expose it via Cloudflare Tunnel (optional, for access from outside your LAN)

The `cloudflared` service in `docker-compose.yml` is already wired to read
`CLOUDFLARE_TUNNEL_TOKEN` from `.env` and connect on boot — you just need to
create the tunnel in the Cloudflare dashboard and grab its token. See
**Cloudflare setup** below.

## Cloudflare setup

### Create the tunnel

1. Go to the Cloudflare Zero Trust dashboard → **Networks → Tunnels**.
2. **Create a tunnel** → connector type **Cloudflared** → name it (e.g.
   `arbox-app`).
3. On the install step, choose the **Docker** option — it shows a command
   containing a long token after `--token`. Copy just that token value into
   `.env` as `CLOUDFLARE_TUNNEL_TOKEN`. (You don't run that install command
   yourself — `docker compose up` runs the `cloudflared` container for you,
   already pointed at this token.)
4. Still in the tunnel setup, add a **Public Hostname**:
   - Subdomain: whatever you want (e.g. `arbox`)
   - Domain: your domain in Cloudflare
   - Service Type: `HTTP`
   - URL: `app:5000` — the Docker Compose service name and port, since
     `cloudflared` reaches `app` over the internal compose network, not the
     host.
5. Save. Once `docker compose up -d` is running with the token set, the
   tunnel comes up automatically — no ports need to be forwarded on your
   router.

### Restrict access to specific emails (Cloudflare Access)

This puts an email-based login wall in front of the tunnel, on top of the
app's own login.

1. In Zero Trust dashboard → **Access → Applications → Add an application**
   → **Self-hosted**.
2. Application domain: the exact hostname you set up above (e.g.
   `arbox.yourdomain.com`).
3. Identity providers: the built-in **One-time PIN** (email code) provider
   is enabled by default — no extra setup needed for email-based login.
4. Add a policy:
   - Action: **Allow**
   - Include rule: **Emails** — list the exact email addresses allowed (you
     + your training partner).
5. Save.

Now visiting the hostname prompts a Cloudflare-hosted login (enter email →
get a one-time code) before the request ever reaches your server. Only the
listed emails can get through. The app's own username/password login still
sits behind that as a second layer.

## How registration timing works

Arbox tells the app, per class, how many hours in advance registration opens
(`enable_registration_time` — 48 or 72 in practice for this gym). When you
press **Schedule**, the app computes the exact open instant and arms a timer
that fires at that second — with a short burst-retry window if the first
attempt hits a transient error, and it keeps trying briefly even if the spot
goes to a waitlist (that still counts as a win). If the server is down when
a class's window opens, the job is marked **missed** on the next boot rather
than attempting a late signup, and a webhook fires to tell you it happened.
Configure that webhook URL (any endpoint that accepts a POST — Home
Assistant, etc.) per-user in Settings.
