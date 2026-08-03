# First invoice checklist — Sprint 9

Goal: collect the first real Stripe payment within 7 days.

## Code complete (this sprint)
- [x] Stripe Checkout + Customer Portal + webhook → subscription fields on User
- [x] Entitlement gate on AI generate + schedule/retry
- [x] Signup → workspace onboarding
- [x] Email verification + password reset flows
- [x] Founder admin overview (`FOUNDER_ADMIN_EMAILS`)
- [x] Deployment + monitoring checklists
- [x] Mock publish blocked in production by default

## Founder actions (blocks first invoice)
1. [ ] Create Stripe **live** Product + Price → set `STRIPE_PRICE_GENESIS`
2. [ ] Set `STRIPE_SECRET_KEY` + webhook secret; wire `/api/billing/webhook`
3. [ ] Deploy with `BILLING_ENFORCE=true` and production Meta + OpenAI keys
4. [ ] Set `RESEND_API_KEY` (or accept console-only email in a private beta)
5. [ ] Add yourself to `FOUNDER_ADMIN_EMAILS`
6. [ ] Run end-to-end with a **real** card (or Stripe test mode then flip to live)
7. [ ] Confirm Stripe shows paid invoice and user `subscriptionStatus=active`
8. [ ] Confirm paid user can: connect IG → generate → schedule → publish

## Customer path (share this)
1. Sign up
2. Create workspace
3. Verify email (optional soft gate)
4. Settings → Subscribe (Genesis)
5. Connect Instagram
6. Generate caption → schedule with public image URL → wait for publish
7. Manage billing via Customer Portal if needed

## Definition of done
First invoice = Stripe Dashboard shows a **Paid** invoice for a non-founder customer (or founder self-pay for proof) with matching `active` subscription on the User row.
