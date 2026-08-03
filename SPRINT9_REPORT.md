# Sprint 9 — First Paying Customer

## Status
Software path for paid self-serve is implemented on `investor-demo`.
**Production readiness: FAIL** until Stripe live keys, Meta live publish proof, and host deploy are complete (see blockers).

## Completion (code vs company)

| Area | Code | Ops / credentials |
|------|------|-------------------|
| Stripe subscriptions | Done | Need live keys + webhook + price |
| Onboarding / workspace | Done | — |
| Email verification | Done | Need Resend (or accept console) |
| Password reset | Done | Need Resend |
| Founder admin | Done | Set `FOUNDER_ADMIN_EMAILS` |
| Deploy / monitoring docs | Done | Execute on host |
| Remove demo mocks | Done (prod-gated) | Keep `ALLOW_MOCK_PUBLISH=false` |
| Full E2E paid workflow | Wired | Need real Meta + Stripe |

**Overall (toward first invoice):** ~70% code-complete; ~35% company-complete (credentials + deploy).

## Remaining blockers
1. Stripe live `STRIPE_SECRET_KEY`, `STRIPE_PRICE_GENESIS`, webhook → `/api/billing/webhook`
2. Production host with `NODE_ENV=production`, `BILLING_ENFORCE=true`
3. Meta App live + proven Instagram publish
4. `RESEND_API_KEY` for real verify/reset emails
5. Postgres backups on the production database

## Exact ETA
- **With Stripe + Meta credentials ready today:** 1–2 days to first invoice (deploy + one paid test customer).
- **Without credentials:** blocked; calendar ETA = credentials lead time + 1–2 days.
- **Mission window:** still achievable inside 7 days if Stripe + Meta are unblocked within ~3–4 days.

## PASS / FAIL
**FAIL** — not production-ready for an unsupervised paying customer until blockers 1–3 are cleared.

## Next actions
Follow `FIRST_INVOICE.md` then `DEPLOYMENT.md`. Verify locally: `node scripts/sprint9-verify.mjs` (API must be running).
