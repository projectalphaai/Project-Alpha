import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePaidAccess } from "../lib/entitlements.js";
import { logActivity, serializeActivity } from "../lib/activity.js";

const router = Router();

const STATUSES = ["draft", "scheduled", "processing", "published", "failed", "cancelled"];
const EDITABLE = new Set(["draft", "scheduled", "failed"]);
const CANCELABLE = new Set(["draft", "scheduled", "failed"]);
const RETRYABLE = new Set(["failed"]);

const platforms = ["instagram", "facebook", "linkedin", "x", "youtube"];
const META_LIVE_PLATFORMS = new Set(["instagram", "facebook"]);

async function assertConnectionForSchedule(userId, platform, { mediaUrl = "", status = "scheduled" } = {}) {
  if (status === "draft") return null;
  if (!META_LIVE_PLATFORMS.has(platform)) return null;

  const connection = await prisma.connectedAccount.findFirst({
    where: {
      userId,
      platform,
      status: { not: "revoked" },
      reconnectRequired: false
    },
    orderBy: { connectedAt: "desc" }
  });

  if (!connection) {
    const err = new Error(
      `Connect an active ${platform} account before scheduling. Open Social Connections to connect.`
    );
    err.status = 409;
    throw err;
  }

  if (platform === "instagram" && status === "scheduled") {
    try {
      const u = new URL(String(mediaUrl || ""));
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad");
    } catch {
      const err = new Error(
        "Instagram schedules require a public image URL in mediaUrl (Meta Content Publishing API)."
      );
      err.status = 400;
      throw err;
    }
  }

  return connection;
}

const postSchema = z.object({
  platform: z.enum(platforms, { errorMap: () => ({ message: "Select a valid platform." }) }),
  caption: z.string().trim().min(10, "Caption must be at least 10 characters.").max(2200),
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  mediaUrl: z.string().url().optional().or(z.literal("")).optional(),
  status: z.enum(["draft", "scheduled"]).optional()
});

function serializePost(post) {
  return {
    id: post.id,
    platform: post.platform,
    caption: post.caption,
    content: post.caption,
    mediaUrl: post.mediaUrl || "",
    scheduledAt: post.scheduledAt.toISOString(),
    datetime: toLocalInputValue(post.scheduledAt),
    status: post.status,
    errorMessage: post.errorMessage || "",
    attemptCount: post.attemptCount || 0,
    maxAttempts: post.maxAttempts || 3,
    lastAttemptAt: post.lastAttemptAt ? post.lastAttemptAt.toISOString() : null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    externalPostId: post.externalPostId || "",
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString()
  };
}

function toLocalInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function parseScheduleDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function defaultDraftSchedule() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setSeconds(0, 0);
  return d;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const where = { userId: req.user.id };
    const status = String(req.query.status || "").trim();
    if (status) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({ ok: false, error: "Invalid status filter." });
      }
      where.status = status;
    }
    if (String(req.query.upcoming || "") === "1") {
      where.status = { in: ["scheduled", "processing"] };
      where.scheduledAt = { gte: new Date() };
    }

    const posts = await prisma.scheduledPost.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }]
    });
    return res.json({ ok: true, posts: posts.map(serializePost) });
  } catch (err) {
    next(err);
  }
});

router.get("/queue", requireAuth, async (req, res, next) => {
  try {
    const posts = await prisma.scheduledPost.findMany({
      where: {
        userId: req.user.id,
        status: { in: ["scheduled", "processing", "failed"] }
      },
      orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
      take: 100
    });
    return res.json({
      ok: true,
      queue: posts.map(serializePost),
      counts: {
        scheduled: posts.filter((p) => p.status === "scheduled").length,
        processing: posts.filter((p) => p.status === "processing").length,
        failed: posts.filter((p) => p.status === "failed").length
      }
    });
  } catch (err) {
    next(err);
  }
});

/** Publish history: published + failed with success/failure detail. */
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const posts = await prisma.scheduledPost.findMany({
      where: {
        userId: req.user.id,
        status: { in: ["published", "failed"] }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: limit
    });

    const history = posts.map((p) => ({
      ...serializePost(p),
      outcome: p.status === "published" ? "success" : "failure",
      detail:
        p.status === "published"
          ? p.externalPostId
            ? `Published (id: ${p.externalPostId})`
            : "Published"
          : p.errorMessage || "Publish failed"
    }));

    return res.json({
      ok: true,
      history,
      counts: {
        published: history.filter((h) => h.outcome === "success").length,
        failed: history.filter((h) => h.outcome === "failure").length
      }
    });
  } catch (err) {
    next(err);
  }
});

/** Founder / ops snapshot for first paying customer readiness. */
router.get("/founder-stats", requireAuth, async (req, res, next) => {
  try {
    const [accounts, scheduled, published, failed, processing] = await Promise.all([
      prisma.connectedAccount.count({
        where: { userId: req.user.id, status: { not: "revoked" } }
      }),
      prisma.scheduledPost.count({
        where: { userId: req.user.id, status: "scheduled" }
      }),
      prisma.scheduledPost.count({
        where: { userId: req.user.id, status: "published" }
      }),
      prisma.scheduledPost.count({
        where: { userId: req.user.id, status: "failed" }
      }),
      prisma.scheduledPost.count({
        where: { userId: req.user.id, status: "processing" }
      })
    ]);

    const activeConnections = await prisma.connectedAccount.count({
      where: {
        userId: req.user.id,
        status: "active",
        reconnectRequired: false
      }
    });

    return res.json({
      ok: true,
      stats: {
        connectedAccounts: accounts,
        activeConnections,
        scheduledPosts: scheduled,
        processingPosts: processing,
        publishedPosts: published,
        failedPosts: failed
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid post."
      });
    }

    const saveAs = parsed.data.status || "scheduled";
    let scheduledAt = parseScheduleDate(parsed.data.scheduledAt);

    if (saveAs === "draft") {
      if (!scheduledAt) scheduledAt = defaultDraftSchedule();
    } else {
      try {
        requirePaidAccess(req.user);
      } catch (err) {
        return res.status(err.status || 402).json({
          ok: false,
          error: err.message,
          code: err.code || "PAYMENT_REQUIRED"
        });
      }
      if (!scheduledAt || scheduledAt <= new Date()) {
        return res.status(400).json({ ok: false, error: "Choose a future date and time." });
      }
    }

    try {
      await assertConnectionForSchedule(req.user.id, parsed.data.platform, {
        mediaUrl: parsed.data.mediaUrl || "",
        status: saveAs
      });
    } catch (err) {
      return res.status(err.status || 400).json({ ok: false, error: err.message });
    }

    const post = await prisma.scheduledPost.create({
      data: {
        userId: req.user.id,
        platform: parsed.data.platform,
        caption: parsed.data.caption,
        mediaUrl: parsed.data.mediaUrl || "",
        scheduledAt,
        status: saveAs
      }
    });

    await logActivity({
      userId: req.user.id,
      postId: post.id,
      type: saveAs === "draft" ? "draft" : "schedule",
      message:
        saveAs === "draft"
          ? `Saved ${post.platform} post draft`
          : `Scheduled ${post.platform} post`,
      meta: { platform: post.platform, status: post.status, scheduledAt: post.scheduledAt.toISOString() }
    });

    return res.status(201).json({ ok: true, post: serializePost(post) });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Post not found." });
    }
    if (!EDITABLE.has(existing.status)) {
      return res.status(409).json({
        ok: false,
        error: `Cannot edit a post with status "${existing.status}".`
      });
    }

    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid post."
      });
    }

    const saveAs = parsed.data.status || (existing.status === "draft" ? "draft" : "scheduled");
    let scheduledAt = parseScheduleDate(parsed.data.scheduledAt) || existing.scheduledAt;

    if (saveAs === "scheduled") {
      try {
        requirePaidAccess(req.user);
      } catch (err) {
        return res.status(err.status || 402).json({
          ok: false,
          error: err.message,
          code: err.code || "PAYMENT_REQUIRED"
        });
      }
      if (!scheduledAt || scheduledAt <= new Date()) {
        return res.status(400).json({ ok: false, error: "Choose a future date and time." });
      }
    }

    try {
      await assertConnectionForSchedule(req.user.id, parsed.data.platform, {
        mediaUrl: parsed.data.mediaUrl || "",
        status: saveAs
      });
    } catch (err) {
      return res.status(err.status || 400).json({ ok: false, error: err.message });
    }

    const post = await prisma.scheduledPost.update({
      where: { id: existing.id },
      data: {
        platform: parsed.data.platform,
        caption: parsed.data.caption,
        mediaUrl: parsed.data.mediaUrl || "",
        scheduledAt,
        status: saveAs,
        errorMessage: saveAs === "scheduled" ? "" : existing.errorMessage
      }
    });

    await logActivity({
      userId: req.user.id,
      postId: post.id,
      type: "edit",
      message: `Updated ${post.platform} post (${post.status})`,
      meta: { platform: post.platform, status: post.status }
    });

    return res.json({ ok: true, post: serializePost(post) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Post not found." });
    }
    if (!CANCELABLE.has(existing.status)) {
      return res.status(409).json({
        ok: false,
        error: `Cannot cancel a post with status "${existing.status}".`
      });
    }

    const post = await prisma.scheduledPost.update({
      where: { id: existing.id },
      data: { status: "cancelled", errorMessage: "" }
    });

    await logActivity({
      userId: req.user.id,
      postId: post.id,
      type: "cancel",
      message: `Cancelled ${post.platform} post`,
      meta: { platform: post.platform, previousStatus: existing.status }
    });

    return res.json({ ok: true, post: serializePost(post) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/retry", requireAuth, async (req, res, next) => {
  try {
    try {
      requirePaidAccess(req.user);
    } catch (err) {
      return res.status(err.status || 402).json({
        ok: false,
        error: err.message,
        code: err.code || "PAYMENT_REQUIRED"
      });
    }

    const existing = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Post not found." });
    }
    if (!RETRYABLE.has(existing.status)) {
      return res.status(409).json({
        ok: false,
        error: `Only failed posts can be retried (current: "${existing.status}").`
      });
    }

    // Re-queue immediately; reset attempt counter for a fresh retry cycle.
    const post = await prisma.scheduledPost.update({
      where: { id: existing.id },
      data: {
        status: "scheduled",
        scheduledAt: new Date(),
        errorMessage: "",
        attemptCount: 0
      }
    });

    await logActivity({
      userId: req.user.id,
      postId: post.id,
      type: "retry",
      message: `Retry queued for ${post.platform} post`,
      meta: { platform: post.platform, attemptCount: post.attemptCount }
    });

    return res.json({ ok: true, post: serializePost(post) });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Post not found." });
    }
    if (existing.status === "processing") {
      return res.status(409).json({
        ok: false,
        error: "Cannot delete a post that is currently processing."
      });
    }

    await prisma.scheduledPost.delete({ where: { id: existing.id } });
    await logActivity({
      userId: req.user.id,
      postId: null,
      type: "delete",
      message: `Deleted ${existing.platform} post`,
      meta: { platform: existing.platform, previousStatus: existing.status, deletedPostId: existing.id }
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
