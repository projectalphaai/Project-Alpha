# Launch Report — Project Alpha Sprint 8

**Date:** 2026-08-03  
**Branch:** `investor-demo`  
**Mission:** First paying customer readiness

---

## What shipped

### Production publishing
- Instagram + Facebook publish via Meta Graph (media container → publish for IG; Page `/feed` for FB)
- Mock publish **blocked in production** unless `ALLOW_MOCK_PUBLISH=true`
- Hybrid routing: IG/FB use live Meta when credentials exist; other networks rejected in prod
- Schedule requires active connection; Instagram requires public image URL
- Scheduler UI: IG/FB only + **Image URL** field with client validation

### Connection & reliability
- Live connection health (`GET /api/connections/health`) + Validate/Reconnect UI
- Founder Dashboard health run shows **per-account** results
- Token refresh updates page access tokens; `ensureFreshConnectionSecrets` before publish
- Retry queue with backoff; manual Retry; user-friendly Meta error mapping

### Visibility
- Publish History (success/failure)
- Founder Dashboard: Connected Accounts, Active Connections, Scheduled, Published, Failed
- Overview stats aligned with founder metrics
- `PRODUCTION_READINESS.md` + `BETA_LAUNCH.md` checklists

### Verification
- `scripts/sprint8-verify.mjs` (+ Sprint 7 module suites where applicable)

---

## What is still missing (blocks “paid SaaS” claim)

| Gap | Impact | Owner action |
|-----|--------|----------------|
| **Live Meta credentials + App Review** | Cannot prove real IG/FB posts in this environment | Set `META_APP_ID` / `META_APP_SECRET`; complete App Review for publish permissions |
| **Proven live publish on a real IG account** | Required before charging | Connect Professional IG + Page; schedule with public image URL; confirm on Instagram |
| **Stripe / billing** | No automated MRR | Add Checkout + entitlement **or** manual invoice for first customer |
| **Password reset / email verify** | Trust / recovery | Recommended before public paid scale |
| **Production host + backups + Sentry** | Ops | Deploy managed Postgres + Node; monitoring |
| LinkedIn / X / YouTube live publish | Out of beta scope | Explicitly deferred |

---

## ETA to first paying customer

| Path | ETA | Notes |
|------|-----|-------|
| **Fastest (founder-led)** | **3–7 days** | Meta credentials live + 1 proven publish + 1 design partner pays manually (invoice / Stripe Payment Link) |
| **Productized Genesis** | **2–3 weeks** | Above + Stripe Checkout + entitlement gate + production deploy + 3 beta partners |

**Recommended next 72 hours**
1. Configure Meta app + prove one live Instagram publish and one Facebook Page post  
2. Complete Production Readiness checklist on a real host  
3. Invite 3 beta users; convert one with a founder invoice or Payment Link  

---

## Go / No-Go

**GO for design-partner beta** once Meta credentials are live and one real post succeeds.  
**NO-GO for “self-serve paid SaaS” marketing** until Stripe (or equivalent) and production ops are green.

Honest positioning today: *production-ready Meta publish architecture for IG/FB + AI + CRM*, awaiting credentialed live proof and billing.
