import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/entitlement.js";
import { probe } from "../lib/video/ffmpeg.js";
import {
  userClipDir,
  generateClipFilename,
  publicUrlForClipFile,
  absolutePathFromClipUrl,
  absoluteUrlForClipFile
} from "../lib/video/storage.js";
import { isRealClipPublishSupported, publishClipToMeta } from "../lib/video/clipPublisher.js";
import { generateSimilarClips } from "../lib/video/similarClips.js";
import { logActivity } from "../lib/activity.js";

/**
 * Sprint 12 — Viral Clip AI routes, mounted at /api/clips.
 * Only touches new Clip* Prisma models — no reads/writes against ScheduledPost,
 * ConnectedAccount is read-only (via clipPublisher.js), Analytics/CRM/Billing
 * routes are untouched.
 */

const router = Router();

const CLIP_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube"];

function safeParseJson(str, fallback) {
  try {
    const parsed = JSON.parse(str);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// --- Uploads -----------------------------------------------------------

const clipStorage = multer.diskStorage({
  destination(req, _file, cb) {
    cb(null, userClipDir(req.user.id));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    cb(null, generateClipFilename(ext));
  }
});

function clipFileFilter(_req, file, cb) {
  if (!String(file.mimetype || "").startsWith("video/")) {
    cb(new Error("Only video files are supported for Clip AI sources."));
    return;
  }
  cb(null, true);
}

const uploadClipVideo = multer({
  storage: clipStorage,
  fileFilter: clipFileFilter,
  limits: { fileSize: config.clipAi.maxUploadSizeMb * 1024 * 1024 }
});

const clipUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.CLIP_AI_RATE_LIMIT || 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "Clip AI upload rate limit exceeded. Please wait and try again." }
});

const clipActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.CLIP_AI_RATE_LIMIT || 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "Clip AI rate limit exceeded. Please wait and try again." }
});

// --- Serializers ---------------------------------------------------------

function serializeSource(source, { includeTranscript = false } = {}) {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    durationSec: source.durationSec,
    width: source.width,
    height: source.height,
    sizeBytes: source.sizeBytes,
    mimeType: source.mimeType,
    status: source.status,
    errorMessage: source.errorMessage,
    analyzedAt: source.analyzedAt ? source.analyzedAt.toISOString() : null,
    createdAt: source.createdAt.toISOString(),
    ...(includeTranscript ? { transcript: safeParseJson(source.transcriptJson, { segments: [] }) } : {})
  };
}

function serializeMoment(m) {
  return {
    id: m.id,
    sourceId: m.sourceId,
    type: m.type,
    startSec: m.startSec,
    endSec: m.endSec,
    score: m.score,
    explanation: m.explanation,
    createdAt: m.createdAt.toISOString()
  };
}

function serializeClip(clip) {
  return {
    id: clip.id,
    sourceId: clip.sourceId,
    groupId: clip.groupId,
    platform: clip.platform,
    momentIds: safeParseJson(clip.momentIdsJson, []),
    startSec: clip.startSec,
    endSec: clip.endSec,
    title: clip.title,
    hashtags: clip.hashtags,
    style: safeParseJson(clip.styleJson, {}),
    aiExplanation: safeParseJson(clip.aiExplanationJson, {}),
    renderStatus: clip.renderStatus,
    errorMessage: clip.errorMessage,
    outputUrl: clip.outputUrl,
    thumbnailUrl: clip.thumbnailUrl,
    durationSec: clip.durationSec,
    createdAt: clip.createdAt.toISOString(),
    updatedAt: clip.updatedAt.toISOString()
  };
}

function serializePublication(p) {
  return {
    id: p.id,
    clipId: p.clipId,
    platform: p.platform,
    status: p.status,
    externalPostId: p.externalPostId,
    errorMessage: p.errorMessage,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString()
  };
}

function serializeSnapshot(s) {
  return {
    id: s.id,
    capturedAt: s.capturedAt.toISOString(),
    views: s.views,
    watchTimeSec: s.watchTimeSec,
    retentionPct: s.retentionPct,
    shares: s.shares,
    saves: s.saves,
    comments: s.comments,
    reach: s.reach,
    followersGained: s.followersGained
  };
}

function removeFileForClipUrl(url, userId) {
  if (!url) return;
  try {
    const filePath = absolutePathFromClipUrl(url, userId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("Failed to remove clip file from disk:", err?.message || err);
  }
}

// --- Sources ---------------------------------------------------------

router.post("/sources", requireAuth, requireEntitlement, clipUploadLimiter, (req, res, next) => {
  uploadClipVideo.single("video")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || "Upload failed." });
    }
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: "No video uploaded." });
      }

      const probed = await probe(file.path);
      const maxDurationSec = config.clipAi.maxSourceDurationMin * 60;
      if (probed.durationSec && probed.durationSec > maxDurationSec) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // best effort cleanup
        }
        return res.status(400).json({
          ok: false,
          error: `Video exceeds the maximum duration of ${config.clipAi.maxSourceDurationMin} minutes.`
        });
      }

      const source = await prisma.clipSource.create({
        data: {
          userId: req.user.id,
          title: String(req.body.title || file.originalname || "").slice(0, 200),
          url: publicUrlForClipFile(req.user.id, file.filename),
          durationSec: probed.durationSec,
          width: probed.width,
          height: probed.height,
          sizeBytes: file.size,
          mimeType: file.mimetype || "",
          status: "uploaded"
        }
      });

      await logActivity({
        userId: req.user.id,
        type: "clip_source_uploaded",
        message: `Uploaded source video "${source.title}" for Clip AI`,
        meta: { sourceId: source.id, durationSec: source.durationSec }
      });

      return res.status(201).json({ ok: true, source: serializeSource(source) });
    } catch (err2) {
      next(err2);
    }
  });
});

router.get("/sources", requireAuth, async (req, res, next) => {
  try {
    const sources = await prisma.clipSource.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return res.json({ ok: true, sources: sources.map((s) => serializeSource(s)) });
  } catch (err) {
    next(err);
  }
});

router.get("/sources/:id", requireAuth, async (req, res, next) => {
  try {
    const source = await prisma.clipSource.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { moments: { orderBy: { startSec: "asc" } } }
    });
    if (!source) return res.status(404).json({ ok: false, error: "Source not found." });
    return res.json({
      ok: true,
      source: serializeSource(source, { includeTranscript: true }),
      moments: source.moments.map(serializeMoment)
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/sources/:id", requireAuth, async (req, res, next) => {
  try {
    const source = await prisma.clipSource.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!source) return res.status(404).json({ ok: false, error: "Source not found." });

    const clips = await prisma.clip.findMany({ where: { sourceId: source.id } });
    for (const clip of clips) {
      removeFileForClipUrl(clip.outputUrl, req.user.id);
      removeFileForClipUrl(clip.thumbnailUrl, req.user.id);
    }

    await prisma.clipSource.delete({ where: { id: source.id } }); // cascades moments + clips
    removeFileForClipUrl(source.url, req.user.id);

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Clip creation from moments/time-range -----------------------------

const styleSchema = z.object({
  zoom: z.enum(["none", "in", "out"]).default("none"),
  transition: z.enum(["none", "fade"]).default("none")
});

const createClipsSchema = z
  .object({
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    momentIds: z.array(z.string()).default([]),
    platforms: z.array(z.enum(CLIP_PLATFORMS)).min(1),
    title: z.string().trim().max(200).default(""),
    hashtags: z.string().trim().max(500).default(""),
    style: styleSchema.default({})
  })
  .refine((d) => d.endSec > d.startSec, { message: "endSec must be greater than startSec." });

router.post("/sources/:id/clips", requireAuth, requireEntitlement, clipActionLimiter, async (req, res, next) => {
  try {
    const source = await prisma.clipSource.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!source) return res.status(404).json({ ok: false, error: "Source not found." });
    if (source.status !== "ready") {
      return res.status(409).json({
        ok: false,
        error: `Source is still "${source.status}". Wait for transcription/analysis to finish before creating clips.`
      });
    }

    const parsed = createClipsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid request." });
    }
    const data = parsed.data;

    const clampedEnd = source.durationSec ? Math.min(data.endSec, source.durationSec) : data.endSec;
    if (clampedEnd - data.startSec < 1) {
      return res.status(400).json({ ok: false, error: "Clip must be at least 1 second long." });
    }

    const groupId = data.platforms.length > 1 ? crypto.randomUUID() : "";
    const created = [];
    for (const platform of data.platforms) {
      const clip = await prisma.clip.create({
        data: {
          userId: req.user.id,
          sourceId: source.id,
          groupId,
          platform,
          momentIdsJson: JSON.stringify(data.momentIds),
          startSec: data.startSec,
          endSec: clampedEnd,
          title: data.title,
          hashtags: data.hashtags,
          styleJson: JSON.stringify(data.style),
          renderStatus: "queued"
        }
      });
      created.push(clip);
    }

    return res.status(201).json({ ok: true, clips: created.map(serializeClip), groupId });
  } catch (err) {
    next(err);
  }
});

// --- Top Performing Clips (must be registered before GET /clips/:id) ---

const SORT_FIELDS = {
  watchTime: "watchTimeSec",
  retention: "retentionPct",
  shares: "shares",
  saves: "saves",
  comments: "comments",
  reach: "reach",
  followers: "followersGained"
};

router.get("/clips/top-performing", requireAuth, async (req, res, next) => {
  try {
    const sortKey = SORT_FIELDS[req.query.sortBy] ? req.query.sortBy : "watchTime";
    const field = SORT_FIELDS[sortKey];

    const clips = await prisma.clip.findMany({
      where: { userId: req.user.id, renderStatus: "ready" },
      include: { publications: { include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } } } }
    });

    const ranked = clips
      .map((clip) => {
        const snapshots = clip.publications.map((p) => p.snapshots[0]).filter(Boolean);
        if (snapshots.length === 0) return null;
        const sum = (key) => snapshots.reduce((acc, s) => acc + (Number(s[key]) || 0), 0);
        const avgRetention = (() => {
          const vals = snapshots.filter((s) => s.retentionPct != null).map((s) => s.retentionPct);
          return vals.length ? vals.reduce((acc, v) => acc + v, 0) / vals.length : 0;
        })();
        const metrics = {
          views: sum("views"),
          watchTimeSec: sum("watchTimeSec"),
          retentionPct: avgRetention,
          shares: sum("shares"),
          saves: sum("saves"),
          comments: sum("comments"),
          reach: sum("reach"),
          followersGained: sum("followersGained")
        };
        return { clip: serializeClip(clip), metrics };
      })
      .filter(Boolean)
      .sort((a, b) => (b.metrics[field] || 0) - (a.metrics[field] || 0));

    return res.json({
      ok: true,
      sortBy: sortKey,
      hasData: ranked.length > 0,
      clips: ranked,
      message:
        ranked.length > 0
          ? null
          : "No clips have real analytics yet. Publish a clip with live platform credentials to start ranking."
    });
  } catch (err) {
    next(err);
  }
});

// --- Clips ---------------------------------------------------------

router.get("/clips", requireAuth, async (req, res, next) => {
  try {
    const where = { userId: req.user.id };
    if (req.query.platform && CLIP_PLATFORMS.includes(req.query.platform)) where.platform = req.query.platform;
    if (req.query.sourceId) where.sourceId = String(req.query.sourceId);
    if (req.query.renderStatus) where.renderStatus = String(req.query.renderStatus);

    const clips = await prisma.clip.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    return res.json({ ok: true, clips: clips.map(serializeClip) });
  } catch (err) {
    next(err);
  }
});

router.get("/clips/:id", requireAuth, async (req, res, next) => {
  try {
    const clip = await prisma.clip.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { publications: { include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } } } }
    });
    if (!clip) return res.status(404).json({ ok: false, error: "Clip not found." });
    return res.json({
      ok: true,
      clip: serializeClip(clip),
      publications: clip.publications.map(serializePublication)
    });
  } catch (err) {
    next(err);
  }
});

const updateClipSchema = z.object({
  startSec: z.number().min(0).optional(),
  endSec: z.number().min(0).optional(),
  momentIds: z.array(z.string()).optional(),
  title: z.string().trim().max(200).optional(),
  hashtags: z.string().trim().max(500).optional(),
  style: z
    .object({
      zoom: z.enum(["none", "in", "out"]).optional(),
      transition: z.enum(["none", "fade"]).optional()
    })
    .optional()
});

router.put("/clips/:id", requireAuth, requireEntitlement, clipActionLimiter, async (req, res, next) => {
  try {
    const clip = await prisma.clip.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!clip) return res.status(404).json({ ok: false, error: "Clip not found." });

    const parsed = updateClipSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid request." });
    }
    const data = parsed.data;

    const nextStart = data.startSec ?? clip.startSec;
    const nextEnd = data.endSec ?? clip.endSec;
    if (nextEnd - nextStart < 1) {
      return res.status(400).json({ ok: false, error: "Clip must be at least 1 second long." });
    }

    const nextStyle = data.style ? { ...safeParseJson(clip.styleJson, {}), ...data.style } : undefined;

    removeFileForClipUrl(clip.outputUrl, req.user.id);
    removeFileForClipUrl(clip.thumbnailUrl, req.user.id);

    const updated = await prisma.clip.update({
      where: { id: clip.id },
      data: {
        startSec: nextStart,
        endSec: nextEnd,
        ...(data.momentIds ? { momentIdsJson: JSON.stringify(data.momentIds) } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.hashtags !== undefined ? { hashtags: data.hashtags } : {}),
        ...(nextStyle ? { styleJson: JSON.stringify(nextStyle) } : {}),
        renderStatus: "queued", // any timeline edit re-triggers a real render
        errorMessage: "",
        outputUrl: "",
        thumbnailUrl: ""
      }
    });

    return res.json({ ok: true, clip: serializeClip(updated) });
  } catch (err) {
    next(err);
  }
});

router.post("/clips/:id/duplicate", requireAuth, requireEntitlement, clipActionLimiter, async (req, res, next) => {
  try {
    const clip = await prisma.clip.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!clip) return res.status(404).json({ ok: false, error: "Clip not found." });

    const dup = await prisma.clip.create({
      data: {
        userId: clip.userId,
        sourceId: clip.sourceId,
        groupId: "",
        platform: clip.platform,
        momentIdsJson: clip.momentIdsJson,
        startSec: clip.startSec,
        endSec: clip.endSec,
        title: clip.title ? `${clip.title} (copy)` : "",
        hashtags: clip.hashtags,
        styleJson: clip.styleJson,
        renderStatus: "queued"
      }
    });
    return res.status(201).json({ ok: true, clip: serializeClip(dup) });
  } catch (err) {
    next(err);
  }
});

const mergeSchema = z.object({ withClipId: z.string().min(1) });

router.post("/clips/:id/merge", requireAuth, requireEntitlement, clipActionLimiter, async (req, res, next) => {
  try {
    const parsed = mergeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "withClipId is required." });
    }

    const [clipA, clipB] = await Promise.all([
      prisma.clip.findFirst({ where: { id: req.params.id, userId: req.user.id } }),
      prisma.clip.findFirst({ where: { id: parsed.data.withClipId, userId: req.user.id } })
    ]);
    if (!clipA || !clipB) return res.status(404).json({ ok: false, error: "Clip not found." });
    if (clipA.sourceId !== clipB.sourceId) {
      return res.status(400).json({ ok: false, error: "Clips must be from the same source video to merge." });
    }

    const startSec = Math.min(clipA.startSec, clipB.startSec);
    const endSec = Math.max(clipA.endSec, clipB.endSec);
    const momentIdsA = safeParseJson(clipA.momentIdsJson, []);
    const momentIdsB = safeParseJson(clipB.momentIdsJson, []);
    const mergedMomentIds = [...new Set([...momentIdsA, ...momentIdsB])];

    const merged = await prisma.clip.create({
      data: {
        userId: req.user.id,
        sourceId: clipA.sourceId,
        groupId: "",
        platform: clipA.platform,
        momentIdsJson: JSON.stringify(mergedMomentIds),
        startSec,
        endSec,
        title: clipA.title || clipB.title,
        hashtags: clipA.hashtags || clipB.hashtags,
        styleJson: clipA.styleJson,
        renderStatus: "queued"
      }
    });
    return res.status(201).json({ ok: true, clip: serializeClip(merged) });
  } catch (err) {
    next(err);
  }
});

router.post("/clips/:id/regenerate", requireAuth, requireEntitlement, clipActionLimiter, async (req, res, next) => {
  try {
    const clip = await prisma.clip.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!clip) return res.status(404).json({ ok: false, error: "Clip not found." });

    removeFileForClipUrl(clip.outputUrl, req.user.id);
    removeFileForClipUrl(clip.thumbnailUrl, req.user.id);

    const updated = await prisma.clip.update({
      where: { id: clip.id },
      data: { renderStatus: "queued", errorMessage: "", outputUrl: "", thumbnailUrl: "" }
    });
    return res.json({ ok: true, clip: serializeClip(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete("/clips/:id", requireAuth, async (req, res, next) => {
  try {
    const clip = await prisma.clip.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!clip) return res.status(404).json({ ok: false, error: "Clip not found." });

    await prisma.clip.delete({ where: { id: clip.id } });
    removeFileForClipUrl(clip.outputUrl, req.user.id);
    removeFileForClipUrl(clip.thumbnailUrl, req.user.id);

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Publish + analytics ---------------------------------------------

router.post("/clips/:id/publish", requireAuth, requireEntitlement, clipActionLimiter, async (req, res, next) => {
  try {
    const clip = await prisma.clip.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!clip) return res.status(404).json({ ok: false, error: "Clip not found." });
    if (clip.renderStatus !== "ready" || !clip.outputUrl) {
      return res
        .status(409)
        .json({ ok: false, error: `Clip is not ready to publish yet (status: ${clip.renderStatus}).` });
    }

    if (!isRealClipPublishSupported(clip.platform)) {
      return res.status(501).json({
        ok: false,
        comingSoon: true,
        error: `${clip.platform} publishing is coming in a future sprint. Instagram and Facebook are live today (once Meta credentials are configured).`
      });
    }

    const publication = await prisma.clipPublication.create({
      data: { clipId: clip.id, userId: req.user.id, platform: clip.platform, status: "publishing" }
    });

    try {
      const caption = [clip.title, clip.hashtags].filter(Boolean).join("\n\n");
      const videoUrl = absoluteUrlForClipFile(clip.outputUrl);
      const result = await publishClipToMeta({
        userId: req.user.id,
        platform: clip.platform,
        videoUrl,
        caption
      });
      const published = await prisma.clipPublication.update({
        where: { id: publication.id },
        data: { status: "published", externalPostId: result.externalPostId, publishedAt: new Date() }
      });
      await logActivity({
        userId: req.user.id,
        type: "clip_published",
        message: `Clip published to ${clip.platform}`,
        meta: { clipId: clip.id, publicationId: published.id }
      });
      return res.status(201).json({ ok: true, publication: serializePublication(published) });
    } catch (publishErr) {
      const message = String(publishErr?.message || publishErr).slice(0, 500);
      const failed = await prisma.clipPublication.update({
        where: { id: publication.id },
        data: { status: "failed", errorMessage: message }
      });
      return res
        .status(publishErr.status || 502)
        .json({ ok: false, error: message, publication: serializePublication(failed) });
    }
  } catch (err) {
    next(err);
  }
});

router.get("/clips/:id/analytics", requireAuth, async (req, res, next) => {
  try {
    const clip = await prisma.clip.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { publications: { include: { snapshots: { orderBy: { capturedAt: "desc" } } } } }
    });
    if (!clip) return res.status(404).json({ ok: false, error: "Clip not found." });

    const hasData = clip.publications.some((p) => p.snapshots.length > 0);
    return res.json({
      ok: true,
      hasData,
      publications: clip.publications.map((p) => ({
        ...serializePublication(p),
        snapshots: p.snapshots.map(serializeSnapshot)
      })),
      message: hasData
        ? null
        : "No analytics yet — analytics appear once this clip is published with live platform credentials and the platform reports real insights."
    });
  } catch (err) {
    next(err);
  }
});

// --- Generate Similar Clips ---------------------------------------------

const generateSimilarSchema = z.object({
  count: z.number().int().min(1).max(5).default(3),
  platforms: z.array(z.enum(CLIP_PLATFORMS)).optional()
});

router.post(
  "/clips/:id/generate-similar",
  requireAuth,
  requireEntitlement,
  clipActionLimiter,
  async (req, res, next) => {
    try {
      const clip = await prisma.clip.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!clip) return res.status(404).json({ ok: false, error: "Clip not found." });

      const parsed = generateSimilarSchema.safeParse(req.body || {});
      const data = parsed.success ? parsed.data : { count: 3 };
      const platforms = data.platforms?.length ? data.platforms : [clip.platform];

      const result = await generateSimilarClips({ userId: req.user.id, clipId: clip.id, count: data.count });

      const createdClips = [];
      for (const candidate of result.candidates) {
        const groupId = platforms.length > 1 ? crypto.randomUUID() : "";
        for (const platform of platforms) {
          const created = await prisma.clip.create({
            data: {
              userId: req.user.id,
              sourceId: candidate.sourceId,
              groupId,
              platform,
              momentIdsJson: JSON.stringify([candidate.momentId]),
              startSec: candidate.startSec,
              endSec: candidate.endSec,
              title: clip.title ? `${clip.title} (similar)` : "",
              hashtags: clip.hashtags,
              styleJson: clip.styleJson,
              renderStatus: "queued",
              aiExplanationJson: JSON.stringify({
                similarTo: clip.id,
                similarity: candidate.similarity,
                momentExplanation: candidate.explanation
              })
            }
          });
          createdClips.push(created);
        }
      }

      return res.status(201).json({
        ok: true,
        basis: result.basis,
        explanation: result.explanation,
        candidates: result.candidates,
        createdClips: createdClips.map(serializeClip)
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
