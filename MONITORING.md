# Monitoring & backups — Sprint 9

Minimum ops for first paying customer. No fancy stack required on day one.

## Health endpoints
- `GET /api/health` — process up, sprint, billing flags, OAuth, publish adapter (no secrets)
- `GET /api/ready` — Postgres reachable

Point an uptime monitor (UptimeRobot / Better Stack / Cronitor) at both every 1–5 minutes.

## What to watch
1. **Publish failures** — Founder Dashboard → Failed count; retry from queue
2. **Connection health** — Run health checks; reconnect if `reconnectRequired`
3. **Billing** — Stripe Dashboard → failed payments; app marks `past_due`
4. **Email** — Resend dashboard delivery; without `RESEND_API_KEY`, verify/reset only log locally

## Logs
- Keep stdout/stderr from `npm start` (includes worker + webhook errors)
- Do not log access tokens, Stripe secrets, or raw webhook payloads in production aggregators without redaction

## Backups
1. Enable automated Postgres backups on the host/provider (daily minimum)
2. Retain ≥ 7 days
3. Once before launch: restore backup to a scratch DB and run `SELECT COUNT(*) FROM "User"`
4. Document restore owner + RTO target (e.g. 4 hours)

## Optional next (not blockers for invoice #1)
- Sentry / error tracking
- Stripe Sigma / revenue alerts
- Log drain to hosted logging
