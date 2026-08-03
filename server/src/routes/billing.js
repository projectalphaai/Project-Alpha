import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { serializeBilling } from "../lib/entitlements.js";
import { logActivity } from "../lib/activity.js";

const router = Router();

function getStripe() {
  if (!config.stripe.secretKey) {
    const err = new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
    err.status = 503;
    throw err;
  }
  return new Stripe(config.stripe.secretKey);
}

router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    return res.json({
      ok: true,
      billing: serializeBilling(user || req.user),
      prices: {
        genesis: config.stripe.priceGenesis || null
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post("/checkout-session", requireAuth, async (req, res, next) => {
  try {
    if (!config.stripe.priceGenesis) {
      return res.status(503).json({
        ok: false,
        error: "Stripe price is not configured. Set STRIPE_PRICE_GENESIS."
      });
    }
    const stripe = getStripe();
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ ok: false, error: "User not found." });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id }
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId }
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: config.stripe.priceGenesis, quantity: 1 }],
      success_url: `${config.appUrl}/pages/dashboard.html?billing=success#settings`,
      cancel_url: `${config.appUrl}/pages/dashboard.html?billing=cancel#settings`,
      allow_promotion_codes: true,
      metadata: { userId: user.id }
    });

    await logActivity({
      userId: user.id,
      type: "billing_checkout_start",
      message: "Started Stripe Checkout for Genesis",
      meta: { sessionId: session.id }
    });

    return res.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

router.post("/portal-session", requireAuth, async (req, res, next) => {
  try {
    const stripe = getStripe();
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.stripeCustomerId) {
      return res.status(400).json({
        ok: false,
        error: "No Stripe customer yet. Subscribe first."
      });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${config.appUrl}/pages/dashboard.html#settings`
    });
    return res.json({ ok: true, url: session.url });
  } catch (err) {
    next(err);
  }
});

export async function handleStripeWebhook(req, res) {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];
  if (!config.stripe.webhookSecret) {
    return res.status(503).json({ ok: false, error: "STRIPE_WEBHOOK_SECRET missing." });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature failed:", err.message);
    return res.status(400).json({ ok: false, error: "Invalid signature." });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.userId;
        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              stripeCustomerId: session.customer || undefined,
              stripeSubscriptionId: session.subscription || undefined,
              plan: "genesis",
              subscriptionStatus: "active"
            }
          });
          await logActivity({
            userId,
            type: "billing_activated",
            message: "Subscription activated via Checkout",
            meta: { sessionId: session.id }
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = String(sub.customer || "");
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (user) {
          const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              stripeSubscriptionId: sub.id,
              subscriptionStatus: status,
              plan: status === "active" || status === "trialing" ? user.plan || "genesis" : "none",
              currentPeriodEnd: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null
            }
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = String(invoice.customer || "");
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: "past_due" }
          });
          await logActivity({
            userId: user.id,
            type: "billing_payment_failed",
            message: "Invoice payment failed",
            meta: { invoiceId: invoice.id }
          });
        }
        break;
      }
      default:
        break;
    }
    return res.json({ ok: true, received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return res.status(500).json({ ok: false, error: "Webhook handler failed." });
  }
}

export default router;
