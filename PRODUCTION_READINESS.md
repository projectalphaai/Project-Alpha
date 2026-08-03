# Production Readiness Checklist — Project Alpha (Sprint 9)

Use this before accepting a paying customer on production.
Also see `DEPLOYMENT.md`, `MONITORING.md`, and `FIRST_INVOICE.md`.

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
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_PRICE_GENESIS`, `STRIPE_WEBHOOK_SECRET`
- [ ] `BILLING_ENFORCE=true`
- [ ] `RESEND_API_KEY` + `EMAIL_FROM`
- [ ] `FOUNDER_ADMIN_EMAILS` set

## Product path
- [ ] Instagram Professional account linked to a Facebook Page (test account)
- [ ] Live Instagram OAuth connect succeeds
- [ ] Live Facebook Page OAuth connect succeeds
- [ ] Connection health check passes (`GET /api/connections/health`)
- [ ] Schedule Instagram post with **public image URL** → published on IG
- [ ] Schedule Facebook text post → published on Page
- [ ] Failed post shows user-friendly error + Retry works
- [ ] Publish History shows success/failure
- [ ] Signup → onboarding → Stripe Checkout → webhook sets `subscriptionStatus=active`
- [ ] Paid user: generate → schedule → publish

## Security
- [x] Password reset / email verify (Sprint 9)
- [ ] CSP enabled or scheduled
- [ ] Privacy Policy + Terms live
- [ ] No secrets in git; `.env` gitignored

## Ops
- [ ] `/api/health` reports `sprint: 9`, `billing.configured: true`, `productionSafe: true`
- [ ] `/api/ready` green
- [ ] Error monitoring (Sentry or equivalent) — optional for invoice #1
- [ ] Uptime check on `/api/ready`
- [ ] Runbook: OAuth outage, token expiry, Meta rate limits

## Billing (gate for “paying”)
- [ ] Stripe products/prices created (live)
- [ ] Checkout + webhook entitlement verified
- [ ] First paid invoice visible in Stripe Dashboard

**Go / No-Go:** Do not onboard a paying customer if mock publish can run in production, live IG/FB publish has not been proven, or Stripe webhook has not activated a test subscription.
