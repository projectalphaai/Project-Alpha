import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePaidAccess } from "../lib/entitlements.js";
import { logActivity, serializeActivity } from "../lib/activity.js";
import { PRIORITIES, findSpacingConflict, spacingErrorMessage } from "../lib/scheduling/spacing.js";
import { buildSmartWarnings } from "../lib/scheduling/warnings.js";
import { computeHeuristicScore, suggestSmartTime } from "../lib/scheduling/aiScore.js";

const router = Router();

const STATUSES = ["draft", "scheduled", "processing", "published", "failed", "cancelled", "archived"];
const EDITABLE = new Set(["draft", "scheduled", "failed"]);
const CANCELABLE = new Set(["draft", "scheduled", "failed"]);
const RETRYABLE = new Set(["failed"]);
const ARCHIVABLE = new Set(["draft", "scheduled", "failed", "cancelled"]);

const platforms = ["instagram", "facebook", "linkedin", "x", "youtube", "tiktok", "pinterest"];
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

const mediaItemSchema = z.object({
  assetId: z.string().min(1),
  url: z.string().min(1),
  type: z.enum(["image", "video"]),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  durationSec: z.number().nullable().optional()
});

const basePostFields = {
  caption: z.string().trim().min(10, "Caption must be at least 10 characters.").max(2200),
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  mediaUrl: z.string().url().optional().or(z.literal("")).optional(),
  media: z.array(mediaItemSchema).max(10).optional(),
  status: z.enum(["draft", "scheduled"]).optional(),
  priority: z.enum(PRIORITIES).optional(),
  source: z.enum(["manual", "ai"]).optional(),
  force: z.boolean().optional()
};

const postSchema = z
  .object({
    platform: z.enum(platforms, { errorMap: () => ({ message: "Select a valid platform." }) }).optional(),
    platforms: z.array(z.enum(platforms)).min(1).max(platforms.length).optional(),
    ...basePostFields
  })
  .refine((data) => Boolean(data.platform) || (data.platforms && data.platforms.length > 0), {
    message: "Select at least one platform.",
    path: ["platform"]
  });

const validateSchema = z
  .object({
    platform: z.enum(platforms).optional(),
    platforms: z.array(z.enum(platforms)).min(1).optional(),
    caption: z.string().trim().min(1).max(2200),
    scheduledAt: z.string().min(1).optional(),
    media: z.array(mediaItemSchema).max(10).optional(),
    excludePostId: z.string().optional()
  })
  .refine((data) => Boolean(data.platform) || (data.platforms && data.platforms.length > 0), {
    message: "Select at least one platform.",
    path: ["platform"]
  });

const scoreSchema = z.object({
  platform: z.enum(platforms),
  caption: z.string().trim().min(1).max(2200),
  scheduledAt: z.string().min(1),
  media: z.array(mediaItemSchema).max(10).optional(),
  timezone: z.string().optional()
});

const cloneSeriesSchema = z.object({
  count: z.number().int().min(1).max(20),
  intervalUnit: z.enum(["day", "week"]).default("day"),
  intervalValue: z.number().int().min(1).max(30).default(1)
});

function parseMediaJson(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAiScoreJson(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function serializePost(post) {
  const media = parseMediaJson(post.mediaJson);
  return {
    id: post.id,
    platform: post.platform,
    caption: post.caption,
    content: post.caption,
    mediaUrl: post.mediaUrl || (media[0]?.url ?? ""),
    media,
    scheduledAt: post.scheduledAt.toISOString(),
    datetime: toLocalInputValue(post.scheduledAt),
    status: post.status,
    errorMessage: post.errorMessage || "",
    attemptCount: post.attemptCount || 0,
    maxAttempts: post.maxAttempts || 3,
    lastAttemptAt: post.lastAttemptAt ? post.lastAttemptAt.toISOString() : null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    externalPostId: post.externalPostId || "",
    priority: post.priority || "normal",
    source: post.source || "manual",
    groupId: post.groupId || "",
    previousStatus: post.previousStatus || "",
    aiScore: parseAiScoreJson(post.aiScoreJson),
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

function primaryMediaUrl(mediaArr, fallback) {
  if (Array.isArray(mediaArr) && mediaArr.length) return mediaArr[0].url;
  return fallback || "";
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
    } else if (String(req.query.includeArchived || "") !== "1") {
      where.status = { not: "archived" };
    }
    if (String(req.query.upcoming || "") === "1") {
      where.status = { in: ["scheduled", "processing"] };
      where.scheduledAt = { gte: new Date() };
    }
    const platformFilter = String(req.query.platform || "").trim();
    if (platformFilter && platforms.includes(platformFilter)) {
      where.platform = platformFilter;
    }
    const sourceFilter = String(req.query.source || "").trim();
    if (sourceFilter === "ai" || sourceFilter === "manual") {
      where.source = sourceFilter;
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

/** Heuristic best-hour suggestion for a platform (see lib/scheduling/aiScore.js). */
router.get("/smart-time", requireAuth, async (req, res, next) => {
  try {
    const platform = String(req.query.platform || "");
    if (!platforms.includes(platform)) {
      return res.status(400).json({ ok: false, error: "Select a valid platform." });
    }
    const timezone = String(req.query.timezone || req.user.timezone || "UTC");
    const result = await suggestSmartTime({ userId: req.user.id, platform, timezone });
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** Heuristic AI Score for a caption/platform/time combo (dry-run, not persisted). */
router.post("/score", requireAuth, async (req, res, next) => {
  try {
    const parsed = scoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid request." });
    }
    const scheduledAt = parseScheduleDate(parsed.data.scheduledAt) || new Date();
    const timezone = parsed.data.timezone || req.user.timezone || "UTC";
    const result = await computeHeuristicScore({
      userId: req.user.id,
      platform: parsed.data.platform,
      caption: parsed.data.caption,
      scheduledAt,
      mediaJson: parsed.data.media || [],
      timezone
    });
    return res.json({ ok: true, score: result });
  } catch (err) {
    next(err);
  }
});

/** Dry-run validation: smart warnings + spacing/connection blockers, nothing persisted. */
router.post("/validate", requireAuth, async (req, res, next) => {
  try {
    const parsed = validateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid request." });
    }
    const data = parsed.data;
    const platformList = data.platforms?.length ? data.platforms : [data.platform];
    const scheduledAt = parseScheduleDate(data.scheduledAt) || new Date();

    const warnings = [];
    const blockers = [];

    for (const platform of platformList) {
      const platformWarnings = await buildSmartWarnings({
        userId: req.user.id,
        platform,
        caption: data.caption,
        mediaJson: data.media || [],
        excludePostId: data.excludePostId || null
      });
      warnings.push(...platformWarnings.map((w) => ({ ...w, platform })));

      const conflict = await findSpacingConflict({
        userId: req.user.id,
        platform,
        scheduledAt,
        excludePostId: data.excludePostId || null
      });
      if (conflict) {
        blockers.push({
          code: "spacing_conflict",
          platform,
          message: spacingErrorMessage(conflict)
        });
      }
    }

    return res.json({ ok: true, warnings, blockers });
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

    const data = parsed.data;
    const platformList = data.platforms?.length ? [...new Set(data.platforms)] : [data.platform];
    const saveAs = data.status || "scheduled";
    let scheduledAt = parseScheduleDate(data.scheduledAt);
    const mediaArr = data.media || [];
    const mediaUrl = primaryMediaUrl(mediaArr, data.mediaUrl);

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

    // Pre-flight check every platform before creating any rows (all-or-nothing fan-out).
    for (const platform of platformList) {
      try {
        await assertConnectionForSchedule(req.user.id, platform, { mediaUrl, status: saveAs });
      } catch (err) {
        return res.status(err.status || 400).json({ ok: false, error: `${platform}: ${err.message}` });
      }

      if (saveAs === "scheduled" && !data.force) {
        const conflict = await findSpacingConflict({ userId: req.user.id, platform, scheduledAt });
        if (conflict) {
          return res.status(409).json({
            ok: false,
            error: spacingErrorMessage(conflict),
            code: "SPACING_CONFLICT",
            platform
          });
        }
      }
    }

    const groupId = platformList.length > 1 ? crypto.randomUUID() : "";
    const timezone = req.user.timezone || "UTC";
    const priority = data.priority || "normal";
    const source = data.source || "manual";

    const created = [];
    for (const platform of platformList) {
      const aiScore = await computeHeuristicScore({
        userId: req.user.id,
        platform,
        caption: data.caption,
        scheduledAt,
        mediaJson: mediaArr,
        timezone
      });

      const post = await prisma.scheduledPost.create({
        data: {
          userId: req.user.id,
          platform,
          caption: data.caption,
          mediaUrl,
          mediaJson: JSON.stringify(mediaArr),
          scheduledAt,
          status: saveAs,
          priority,
          source,
          groupId,
          aiScoreJson: JSON.stringify(aiScore)
        }
      });
      created.push(post);

      await logActivity({
        userId: req.user.id,
        postId: post.id,
        type: saveAs === "draft" ? "draft" : "schedule",
        message:
          saveAs === "draft"
            ? `Saved ${post.platform} post draft`
            : `Scheduled ${post.platform} post`,
        meta: { platform: post.platform, status: post.status, scheduledAt: post.scheduledAt.toISOString(), groupId }
      });
    }

    const warnings = await buildSmartWarnings({
      userId: req.user.id,
      platform: platformList[0],
      caption: data.caption,
      mediaJson: mediaArr
    });

    return res.status(201).json({
      ok: true,
      post: serializePost(created[0]),
      posts: created.map(serializePost),
      groupId,
      warnings
    });
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

    const data = parsed.data;
    const platform = data.platforms?.length ? data.platforms[0] : data.platform;
    const saveAs = data.status || (existing.status === "draft" ? "draft" : "scheduled");
    let scheduledAt = parseScheduleDate(data.scheduledAt) || existing.scheduledAt;
    const mediaArr = data.media !== undefined ? data.media : parseMediaJson(existing.mediaJson);
    const mediaUrl = primaryMediaUrl(mediaArr, data.mediaUrl ?? existing.mediaUrl);

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
      await assertConnectionForSchedule(req.user.id, platform, { mediaUrl, status: saveAs });
    } catch (err) {
      return res.status(err.status || 400).json({ ok: false, error: err.message });
    }

    if (saveAs === "scheduled" && !data.force) {
      const conflict = await findSpacingConflict({
        userId: req.user.id,
        platform,
        scheduledAt,
        excludePostId: existing.id
      });
      if (conflict) {
        return res.status(409).json({
          ok: false,
          error: spacingErrorMessage(conflict),
          code: "SPACING_CONFLICT"
        });
      }
    }

    const timezone = req.user.timezone || "UTC";
    const aiScore = await computeHeuristicScore({
      userId: req.user.id,
      platform,
      caption: data.caption,
      scheduledAt,
      mediaJson: mediaArr,
      timezone
    });

    const post = await prisma.scheduledPost.update({
      where: { id: existing.id },
      data: {
        platform,
        caption: data.caption,
        mediaUrl,
        mediaJson: JSON.stringify(mediaArr),
        scheduledAt,
        status: saveAs,
        priority: data.priority || existing.priority,
        errorMessage: saveAs === "scheduled" ? "" : existing.errorMessage,
        aiScoreJson: JSON.stringify(aiScore)
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

/** Clone as a new draft, one day later — a real, independent copy. */
router.post("/:id/duplicate", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Post not found." });
    }

    const scheduledAt = new Date(existing.scheduledAt);
    scheduledAt.setDate(scheduledAt.getDate() + 1);

    const clone = await prisma.scheduledPost.create({
      data: {
        userId: req.user.id,
        platform: existing.platform,
        caption: existing.caption,
        mediaUrl: existing.mediaUrl,
        mediaJson: existing.mediaJson,
        scheduledAt,
        status: "draft",
        priority: existing.priority,
        source: existing.source,
        groupId: ""
      }
    });

    await logActivity({
      userId: req.user.id,
      postId: clone.id,
      type: "duplicate",
      message: `Duplicated ${existing.platform} post as a new draft`,
      meta: { platform: existing.platform, sourcePostId: existing.id }
    });

    return res.status(201).json({ ok: true, post: serializePost(clone) });
  } catch (err) {
    next(err);
  }
});

/** Clone to N future dates at a chosen interval — for repeat campaigns. */
router.post("/:id/clone-series", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Post not found." });
    }

    const parsed = cloneSeriesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid request." });
    }

    const { count, intervalUnit, intervalValue } = parsed.data;
    const dayMs = 24 * 60 * 60 * 1000;
    const stepMs = intervalUnit === "week" ? intervalValue * 7 * dayMs : intervalValue * dayMs;
    const seriesId = crypto.randomUUID();

    const created = [];
    for (let i = 1; i <= count; i += 1) {
      const scheduledAt = new Date(existing.scheduledAt.getTime() + stepMs * i);
      const clone = await prisma.scheduledPost.create({
        data: {
          userId: req.user.id,
          platform: existing.platform,
          caption: existing.caption,
          mediaUrl: existing.mediaUrl,
          mediaJson: existing.mediaJson,
          scheduledAt,
          status: "draft",
          priority: existing.priority,
          source: existing.source,
          groupId: seriesId
        }
      });
      created.push(clone);
    }

    await logActivity({
      userId: req.user.id,
      postId: existing.id,
      type: "clone_series",
      message: `Cloned ${existing.platform} post into a ${count}-post series (every ${intervalValue} ${intervalUnit}(s))`,
      meta: { platform: existing.platform, sourcePostId: existing.id, count, intervalUnit, intervalValue, seriesId }
    });

    return res.status(201).json({ ok: true, posts: created.map(serializePost), seriesId });
  } catch (err) {
    next(err);
  }
});

/** Soft-archive: hides from default views but keeps a real, restorable record. */
router.post("/:id/archive", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Post not found." });
    }
    if (!ARCHIVABLE.has(existing.status)) {
      return res.status(409).json({
        ok: false,
        error: `Cannot archive a post with status "${existing.status}".`
      });
    }

    const post = await prisma.scheduledPost.update({
      where: { id: existing.id },
      data: { status: "archived", previousStatus: existing.status }
    });

    await logActivity({
      userId: req.user.id,
      postId: post.id,
      type: "archive",
      message: `Archived ${post.platform} post`,
      meta: { platform: post.platform, previousStatus: existing.status }
    });

    return res.json({ ok: true, post: serializePost(post) });
  } catch (err) {
    next(err);
  }
});

/** Real Undo — reverts an archived post back to its previous status. */
router.post("/:id/restore", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.scheduledPost.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Post not found." });
    }
    if (existing.status !== "archived" || !existing.previousStatus) {
      return res.status(409).json({ ok: false, error: "Only archived posts can be restored." });
    }

    const post = await prisma.scheduledPost.update({
      where: { id: existing.id },
      data: { status: existing.previousStatus, previousStatus: "" }
    });

    await logActivity({
      userId: req.user.id,
      postId: post.id,
      type: "restore",
      message: `Restored ${post.platform} post to "${post.status}"`,
      meta: { platform: post.platform, restoredStatus: post.status }
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
