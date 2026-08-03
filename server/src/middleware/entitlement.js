import { requirePaidAccess } from "../lib/entitlements.js";

/** Gate paid features (AI generate, schedule/publish). Use after requireAuth. */
export function requireEntitlement(req, res, next) {
  try {
    requirePaidAccess(req.user);
    return next();
  } catch (err) {
    return res.status(err.status || 402).json({
      ok: false,
      error: err.message,
      code: err.code || "PAYMENT_REQUIRED"
    });
  }
}
