import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const ALLOWED_RANGES = new Set([7, 30, 90]);
const PLATFORMS = ["instagram", "facebook", "linkedin", "x", "youtube"];

function parseRange(value) {
  const n = Number(value);
  return ALLOWED_RANGES.has(n) ? n : 30;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Real, internally-sourced analytics (no Meta Graph Insights — publish
 * pipeline + connection data only). Read-only aggregation over the
 * authenticated user's own rows.
 */
router.get("/overview", requireAuth, async (req, res, next) => {
  try {
    const range = parseRange(req.query.range);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (range - 1));

    const [posts, connections] = await Promise.all([
      prisma.scheduledPost.findMany({
        where: { userId: req.user.id, createdAt: { gte: since } },
        select: {
          platform: true,
          status: true,
          createdAt: true,
          publishedAt: true,
          scheduledAt: true
        }
      }),
      prisma.connectedAccount.findMany({
        where: { userId: req.user.id },
        select: { status: true, reconnectRequired: true }
      })
    ]);

    const totals = {
      total: posts.length,
      draft: 0,
      scheduled: 0,
      processing: 0,
      published: 0,
      failed: 0,
      cancelled: 0
    };

    const platformMap = new Map(
      PLATFORMS.map((p) => [p, { platform: p, total: 0, published: 0, failed: 0, scheduled: 0 }])
    );

    const timelineMap = new Map();
    for (let i = 0; i < range; i += 1) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      timelineMap.set(dateKey(d), { date: dateKey(d), published: 0, failed: 0, scheduled: 0 });
    }

    posts.forEach((post) => {
      if (totals[post.status] !== undefined) totals[post.status] += 1;

      const platformStat = platformMap.get(post.platform);
      if (platformStat) {
        platformStat.total += 1;
        if (post.status === "published") platformStat.published += 1;
        if (post.status === "failed") platformStat.failed += 1;
        if (post.status === "scheduled") platformStat.scheduled += 1;
      }

      const bucketDate = post.publishedAt || post.createdAt;
      const key = dateKey(new Date(bucketDate));
      const bucket = timelineMap.get(key);
      if (bucket && (post.status === "published" || post.status === "failed")) {
        bucket[post.status] += 1;
      } else if (bucket && post.status === "scheduled") {
        bucket.scheduled += 1;
      }
    });

    const publishedOrFailed = totals.published + totals.failed;
    const successRate =
      publishedOrFailed > 0 ? Math.round((totals.published / publishedOrFailed) * 1000) / 10 : null;

    const byPlatform = Array.from(platformMap.values()).filter((p) => p.total > 0);
    const topPlatform =
      byPlatform.length > 0
        ? byPlatform.reduce((a, b) => (b.total > a.total ? b : a)).platform
        : null;

    return res.json({
      ok: true,
      range,
      since: since.toISOString(),
      totals,
      successRate,
      byPlatform,
      topPlatform,
      timeline: Array.from(timelineMap.values()),
      connections: {
        total: connections.length,
        active: connections.filter((c) => c.status === "active" && !c.reconnectRequired).length,
        reconnectRequired: connections.filter((c) => c.reconnectRequired).length
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
