# Production deployment checklist — Sprint 9

Use this before pointing a real customer at the app.

## 1. Host & process
- [ ] Deploy Node 20+ on a single host or container with persistent disk / managed Postgres
- [ ] Set `NODE_ENV=production`
- [ ] Set public `APP_URL=https://your-domain` (no trailing slash)
- [ ] Process manager (systemd / PM2 / container restart policy) runs `npm start`
- [ ] Publish worker enabled: `ENABLE_PUBLISH_WORKER=true`

## 2. Secrets
- [ ] `DATABASE_URL` points at production Postgres
- [ ] `JWT_SECRET` ≥ 32 chars (unique, not from .env.example)
- [ ] `TOKEN_ENCRYPTION_KEY` ≥ 32 chars
- [ ] `OPENAI_API_KEY` set
- [ ] `META_APP_ID` / `META_APP_SECRET` set; OAuth redirect URI matches `APP_URL`
- [ ] `STRIPE_SECRET_KEY` (live), `STRIPE_PRICE_GENESIS`, `STRIPE_WEBHOOK_SECRET`
- [ ] `RESEND_API_KEY` + verified `EMAIL_FROM` domain
- [ ] `FOUNDER_ADMIN_EMAILS=you@company.com`
- [ ] `BILLING_ENFORCE=true`
- [ ] `ALLOW_MOCK_PUBLISH=false`
- [ ] `PUBLISH_ADAPTER=auto` (or `meta-live`)

## 3. Stripe
- [ ] Live mode Product + Price for Genesis plan
- [ ] Webhook endpoint: `https://your-domain/api/billing/webhook`
- [ ] Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Customer portal enabled in Stripe Dashboard
- [ ] Test Checkout once with a real card → user `subscriptionStatus=active`

## 4. Meta
- [ ] App in Live mode (or test users only for soft launch)
- [ ] Instagram Professional account linked to a Facebook Page
- [ ] Permissions granted for content publish
- [ ] Prove one real IG publish from the queue

## 5. Database
- [ ] `npm run db:migrate:deploy`
- [ ] Automated backups (daily) + restore drill documented (see MONITORING.md)

## 6. Smoke after deploy
- [ ] `GET /api/health` → `sprint: 9`, `billing.configured: true`, `publishWorker.productionSafe: true`
- [ ] `GET /api/ready` → `ok: true`
- [ ] Signup → onboarding → Settings → Subscribe → webhook activates plan
- [ ] Connect Instagram → generate → schedule (with media URL) → publish → invoice in Stripe
