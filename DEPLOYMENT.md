# Deploying Tolkyn

One `docker-compose up` runs the whole stack: Postgres, Redis, the FastAPI
backend, the self-hosted WhatsApp worker, the Next.js frontend, and nginx as
the single public entry point.

> Commands below use `docker-compose` (v1, hyphenated). If your server has
> Compose v2, `docker compose` (space) works identically — the compose file is
> written in the `2.4` format that both accept.

## First-time setup on the server

```bash
git clone <your repo> tolkyn && cd tolkyn

# Compose-level values (Postgres credentials, the frontend's build-time API URL)
cp .env.example .env
nano .env                     # set a real DB_PASSWORD at minimum

# App-level values (JWT secret, API keys, SMTP, everything else)
cp backend/.env.example backend/.env
nano backend/.env             # see the checklist below — several of these MUST change

docker-compose up -d --build
```

Check everything came up healthy:

```bash
docker-compose ps
curl -f http://localhost/api/v1/health
```

## Before you go live — checklist

These are the settings that are safe defaults for local dev but need a real
value in production. `backend/.env.example` has every one of them.

- **`SECRET_KEY`** — generate with `openssl rand -hex 32`. Signs every login
  token; the placeholder default is public (it's in this repo's own example
  file) and forgeable by anyone who reads it.
- **`DEBUG=false`** — `true` exposes `/docs`, `/redoc`, `/openapi.json` and
  turns on verbose SQL logging.
- **`ALLOWED_ORIGINS`** and **`ALLOWED_HOSTS`** — your real domain(s), not
  `localhost` and not `*`. `ALLOWED_HOSTS` only takes effect when
  `APP_ENV=production`.
- **`FRONTEND_URL`** — your real public URL (`https://tolkyn.co.ke`). Used to
  build invite links and OAuth redirects — pointing it at an internal Docker
  hostname will silently break both.
- **`DB_PASSWORD`** (root `.env`) — not `change-me-to-a-real-password`.
- **`SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`** — the platform-operator
  login, re-synced from `.env` on every restart.
- **TLS** — nginx ships listening on plain `:80` only. Get a certificate
  (easiest: `certbot --nginx`, or terminate TLS at a managed load balancer in
  front of this stack) and uncomment the HTTPS server block in
  `nginx/nginx.conf`.

## Behind a host nginx (server already runs nginx for other apps)

The compose stack's nginx is published on **`127.0.0.1:8090`**, not `:80` — so
it never fights a host nginx that already owns `:80`/`:443`. The host nginx
reverse-proxies the public domain to that port:

```bash
sudo cp nginx/host-tolkyn.co.ke.conf /etc/nginx/sites-available/tolkyn.co.ke
sudo ln -s /etc/nginx/sites-available/tolkyn.co.ke /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS — certbot edits that vhost in place to add :443 + the http→https redirect
sudo certbot --nginx -d tolkyn.co.ke -d www.tolkyn.co.ke
```

The container's own nginx still does the `/api` → backend, `/media` → backend,
`/` → frontend routing; the host nginx just forwards everything to it. Leave
the container's `:443` block alone — TLS terminates at the host.

**No host nginx?** Then change the compose `nginx` port back to `"80:80"`
(and `"443:443"`), and use the container's own `nginx/nginx.conf` TLS block
per the checklist above.

## Call centre — Asterisk PBX + Cloud One SIP trunk

Tolkyn runs **one** Asterisk (`asterisk/`) for all tenants, in front of a
single shared Cloud One SIP trunk (Tolkyn is the reseller — it owns the trunk
and its pool of DIDs, and assigns one DID per client). See `asterisk/README.md`
for the internals.

Asterisk runs **natively on the host** (not Docker — Docker's network layer
breaks WebRTC media). One script does everything: install Asterisk, render the
config, install + start coturn (the media relay) and the AMI call-event bridge.

**Enable it:**

1. Root `.env` — fill in the `CLOUDONE_*` / `PBX_*` / `SOFTPHONE_*` block
   (see `.env.example`). Required: `CLOUDONE_SIP_PASSWORD`,
   `SOFTPHONE_EXT_PASSWORD`, `PBX_PUBLIC_IP` (this server's public IP),
   `PBX_TURN_PASSWORD` (call audio), and `PBX_AMI_PASSWORD` +
   `PBX_EVENT_WEBHOOK_SECRET` (live call state in the UI). Generate secrets with
   `openssl rand -hex 20`.

2. DNS — a `pbx.<domain>` A record at the server IP (Cloudflare: Proxied is
   fine; it's covered by a `*.<domain>` origin cert).

3. Host nginx — the PBX WebSocket vhost:
   ```bash
   sudo cp nginx/host-pbx.tolkyn.co.ke.conf /etc/nginx/sites-available/pbx.tolkyn.co.ke
   sudo ln -s /etc/nginx/sites-available/pbx.tolkyn.co.ke /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. Rebuild the app so the backend gets `PBX_EVENT_WEBHOOK_SECRET`, then run the
   installer:
   ```bash
   docker-compose up -d --build backend frontend
   sudo bash asterisk/install-on-host.sh
   ```
   The installer opens the firewall it needs (SIP from the trunk only, coturn
   `udp/3478` + `udp/49152-49200` to the world, AMI localhost-only).

5. Check trunk + relay + bridge:
   ```bash
   sudo asterisk -rx "pjsip show registrations"      # trunk Registered
   systemctl is-active coturn tolkyn-ami-bridge      # both active
   journalctl -u tolkyn-ami-bridge -f               # call events as they fire
   ```

**Per client:** Super Admin → Telephony → set provider **Tolkyn PBX**, tick
Active, set their **Assigned DID**. Then in that client's Call Center → Agent
lines, give each agent a SIP extension + password — and add the matching
endpoint to `asterisk/etc/pjsip.conf.template` (multi-tenant PJSIP-from-DB and
ARI call control / CDR is the next phase, not the POC).

## Capacity — running ~100 client workspaces

100 tenant workspaces is a *data* number, not a load number — most are idle at
any given moment. What actually sizes the box is concurrent in-flight
requests, and this app's per-request work is light (a few indexed queries).

A reasonable starting point for ~100 active workspaces (say 150–250 signed-in
users, the dashboard polling every 6–30s):

| Piece      | Setting                        | Value                     |
| ---------- | ------------------------------ | ------------------------- |
| Server     | vCPU / RAM                     | 4 vCPU / 8 GB             |
| Backend    | `WEB_CONCURRENCY`              | `5` (≈ 2×vCPU + 1)        |
| Backend    | `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `10` / `15`           |
| Postgres   | `max_connections` (compose)    | `200`                     |
| Postgres   | shared_buffers / effective_cache | leave Alpine defaults, or move to managed Postgres |

That's `5 workers × (10 + 15) = 125` peak Postgres connections, comfortably
under `200`. Redis holds only rate-limit counters and the scheduler lock —
negligible.

Scale up from there by watching `docker stats` under real load: if the
**backend** containers are CPU-bound, raise `WEB_CONCURRENCY` (and
`max_connections` to match); if **Postgres** is the pegged one, that's a
bigger instance or a managed Postgres with a read replica, not a code change.
The app is stateless behind nginx, so `--scale backend=N` across machines
works with no extra wiring (see below).

## Scaling — what actually happens when you add capacity

- **More backend throughput on one machine**: raise `WEB_CONCURRENCY` in
  `backend/.env` (gunicorn worker count — rule of thumb: `2 × CPU cores + 1`)
  and restart. Each worker holds its own DB connection pool
  (`DB_POOL_SIZE` + `DB_MAX_OVERFLOW`), so raising both worker count *and*
  pool size compounds — keep the product comfortably under Postgres's own
  `max_connections`.
- **More backend replicas across machines / a swarm / k8s**:
  `docker-compose up -d --scale backend=3`. Safe out of the box — the
  background scheduler (due-post publishing, automations, social-lead
  classification) elects a single leader across every replica via a
  Redis lock (`app/core/scheduler_lock.py`), and rate limiting is
  Redis-backed (`app/core/rate_limit.py`) so a limit is enforced across all
  of them together, not per-replica. Nothing needs to be told "you're the
  scheduler" — they negotiate it themselves.
- **Redis or Postgres becomes the bottleneck first**, not the API — this
  stack's own state per request is small. Watch `docker stats` under load;
  if Postgres is pegged, that's a bigger-instance/read-replica conversation,
  not a code change.
- **The frontend** is a stateless Next.js server (`output: standalone`) —
  scale it the same way as the backend, `--scale frontend=N`, no special
  handling needed.

## Self-hosted WhatsApp (whatsapp-worker) — read before enabling it

This connects real WhatsApp numbers via QR code (Baileys) — it is **not**
Meta's official Business API. Every workspace that connects a number through
this is accepting a real, per-number risk that WhatsApp restricts that
specific number for automated use. The UI requires an explicit checkbox
acknowledgment before connecting for exactly this reason — don't remove it.

- **`whatsapp_sessions` is the one volume you cannot lose casually.** It
  holds every connected workspace's session credentials. Losing it logs
  every connected number out and forces a fresh QR scan for each one — back
  it up the same way you back up `postgres_data`.
- **Never expose this service publicly.** It has no auth of its own beyond
  the shared secret, and it isn't designed to be internet-facing — the
  compose file deliberately gives it no published port. Only `backend` talks
  to it, over the internal network.
- **`INTERNAL_SHARED_SECRET` must be identical** in the root `.env` and
  `backend/.env` — it's how the backend and worker authenticate each other.
- Anti-ban pacing and a daily-send warm-up ramp are built into the worker
  (`whatsapp-worker/src/antiban.js`) — real mitigations for the most obvious
  automation tells, not a guarantee against ever being restricted.
- Don't want this at all? Set `whatsapp-worker`'s image to never build/start
  and remove it from `backend`'s `depends_on` — the rest of the app runs
  fine without it; only the WhatsApp connect card in Messaging won't work.

## What's deliberately NOT containerized

`playwright` is in `backend/requirements.txt` but nothing in the app
currently imports it — the Docker image installs the Python package only,
not its ~300MB of browser binaries, since nothing would use them. If you add
a feature that needs real browser automation later, that's a `RUN playwright
install --with-deps chromium` line to add back into `backend/Dockerfile`.

## Backups

`postgres_data` is a named Docker volume — back it up like any Postgres
instance (`pg_dump`, a scheduled snapshot of the volume, or point `DB_HOST`
at a managed Postgres instance instead of the bundled container if you'd
rather not run backups yourself).
