# Production Readiness Checklist — Project Alpha (Sprint 8)

Use this before accepting a paying customer on production.

## Infrastructure
- [ ] `NODE_ENV=production`
- [ ] Managed PostgreSQL with automated backups
- [ ] HTTPS custom domain (`APP_URL`)
- [ ] Secrets set: `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`
- [ ] `META_APP_ID` + `META_APP_SECRET` set
- [ ] Meta redirect URI registered: `{APP_URL}/api/oauth/meta/callback`
- [ ] `PUBLISH_ADAPTER=auto` or `meta-live` (mock blocked in production)
- [ ] `ALLOW_MOCK_PUBLISH` is **false**
- [ ] Single publish worker process (do not run API + `npm run worker` both claiming)

## Product path
- [ ] Instagram Professional account linked to a Facebook Page (test account)
- [ ] Live Instagram OAuth connect succeeds
- [ ] Live Facebook Page OAuth connect succeeds
- [ ] Connection health check passes (`GET /api/connections/health`)
- [ ] Schedule Instagram post with **public image URL** → published on IG
- [ ] Schedule Facebook text post → published on Page
- [ ] Failed post shows user-friendly error + Retry works
- [ ] Publish History shows success/failure

## Security
- [ ] Password reset / email verify (recommended before paid scale)
- [ ] CSP enabled or scheduled
- [ ] Privacy Policy + Terms live
- [ ] No secrets in git; `.env` gitignored

## Ops
- [ ] `/api/health` reports `sprint: 8`, `productionSafe: true`, adapter `meta-live`
- [ ] `/api/ready` green
- [ ] Error monitoring (Sentry or equivalent)
- [ ] Uptime check on `/api/ready`
- [ ] Runbook: OAuth outage, token expiry, Meta rate limits

## Billing (gate for “paying”)
- [ ] Stripe products/prices created
- [ ] Checkout + webhook entitlement (if shipping paid this week)
- [ ] Or: founder invoice / manual payment recorded with access granted

**Go / No-Go:** Do not onboard a paying customer if mock publish can run in production or live IG/FB publish has not been proven on a real account.
