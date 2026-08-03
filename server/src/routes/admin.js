import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { normalizeRole } from "../middleware/rbac.js";

const router = Router();

function requireFounderAdmin(req, res, next) {
  const email = String(req.user?.email || "").toLowerCase();
  const role = normalizeRole(req.user?.role);
  // Platform admin is founder allowlist only (or explicit role=admin — not default owner).
  const allowed = config.billing.founderEmails.has(email) || role === "admin";
  if (!allowed) {
    return res.status(403).json({ ok: false, error: "Founder admin access required." });
  }
  return next();
}

router.get("/overview", requireAuth, requireFounderAdmin, async (req, res, next) => {
  try {
    const [
      users,
      paid,
      pastDue,
      verified,
      onboarded,
      connections,
      scheduled,
      published,
      failed
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { subscriptionStatus: { in: ["active", "trialing"] } }
      }),
      prisma.user.count({ where: { subscriptionStatus: "past_due" } }),
      prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      prisma.user.count({ where: { onboardingComplete: true } }),
      prisma.connectedAccount.count({ where: { status: "active" } }),
      prisma.scheduledPost.count({ where: { status: "scheduled" } }),
      prisma.scheduledPost.count({ where: { status: "published" } }),
      prisma.scheduledPost.count({ where: { status: "failed" } })
    ]);

    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        email: true,
        name: true,
        workspaceName: true,
        plan: true,
        subscriptionStatus: true,
        onboardingComplete: true,
        emailVerifiedAt: true,
        createdAt: true
      }
    });

    return res.json({
      ok: true,
      overview: {
        users,
        paidSubscribers: paid,
        pastDue,
        verifiedEmails: verified,
        onboarded,
        activeConnections: connections,
        scheduledPosts: scheduled,
        publishedPosts: published,
        failedPosts: failed
      },
      recentUsers: recentUsers.map((u) => ({
        ...u,
        emailVerified: Boolean(u.emailVerifiedAt),
        createdAt: u.createdAt.toISOString()
      }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
