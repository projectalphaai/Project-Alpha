import { config } from "../config.js";

export const PAID_STATUSES = new Set(["active", "trialing"]);

export function serializeBilling(user) {
  return {
    plan: user.plan || "none",
    subscriptionStatus: user.subscriptionStatus || "none",
    currentPeriodEnd: user.currentPeriodEnd ? user.currentPeriodEnd.toISOString() : null,
    stripeCustomerId: user.stripeCustomerId || null,
    hasPaidAccess: hasPaidAccess(user),
    billingConfigured: Boolean(config.stripe.secretKey && config.stripe.priceGenesis),
    enforceBilling: config.billing.enforce
  };
}

export function hasPaidAccess(user) {
  if (!config.billing.enforce) return true;
  if (config.billing.founderEmails.has(String(user.email || "").toLowerCase())) return true;
  return PAID_STATUSES.has(String(user.subscriptionStatus || "none"));
}

export function requirePaidAccess(user) {
  if (hasPaidAccess(user)) return;
  const err = new Error(
    "An active subscription is required. Open Settings → Billing to subscribe."
  );
  err.status = 402;
  err.code = "PAYMENT_REQUIRED";
  throw err;
}
