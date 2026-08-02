import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { generateSocialContent } from "../lib/openai.js";

const router = Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AI_RATE_LIMIT || 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "AI rate limit exceeded. Please wait and try again." }
});

const platforms = ["instagram", "facebook", "linkedin", "x", "youtube"];
const goals = ["awareness", "engagement", "leads", "launch", "education"];
const tones = ["professional", "friendly", "bold", "witty", "inspirational"];

const generateSchema = z.object({
  platform: z.enum(platforms, { errorMap: () => ({ message: "Select a valid platform." }) }),
  contentGoal: z.enum(goals, { errorMap: () => ({ message: "Select a valid content goal." }) }),
  tone: z.enum(tones, { errorMap: () => ({ message: "Select a valid tone." }) }),
  topic: z.string().trim().min(3, "Topic must be at least 3 characters.").max(160, "Topic is too long."),
  audience: z.string().trim().max(120, "Audience is too long.").optional().default(""),
  language: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .optional()
    .default("en")
});

const draftSaveSchema = generateSchema.extend({
  caption: z.string().trim().min(1).max(4000),
  hashtags: z.string().trim().min(1).max(1000),
  shortHook: z.string().trim().min(1).max(280),
  callToAction: z.string().trim().min(1).max(280),
  generatedAt: z.string().datetime().optional()
});

function serializeDraft(draft) {
  return {
    id: draft.id,
    platform: draft.platform,
    contentGoal: draft.contentGoal,
    tone: draft.tone,
    topic: draft.topic,
    audience: draft.audience || "",
    language: draft.language || "en",
    caption: draft.caption,
    hashtags: draft.hashtags,
    shortHook: draft.shortHook || "",
    callToAction: draft.callToAction || "",
    generatedAt: draft.generatedAt ? draft.generatedAt.toISOString() : null,
    savedAt: draft.createdAt.toISOString()
  };
}

function safeAiError(err, res) {
  const status = err.status || 502;
  const message =
    status === 503 || status === 429 || status === 504 || status === 400
      ? err.message
      : "AI content generation failed. Please try again.";
  return res.status(status).json({ ok: false, error: message });
}

router.post("/generate-content", requireAuth, aiLimiter, async (req, res) => {
  try {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid generation request."
      });
    }

    const result = await generateSocialContent(parsed.data);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("AI generate-content failed:", err?.name || "Error", err?.status || "");
    return safeAiError(err, res);
  }
});

router.get("/drafts", requireAuth, async (req, res, next) => {
  try {
    const drafts = await prisma.draft.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return res.json({ ok: true, drafts: drafts.map(serializeDraft) });
  } catch (err) {
    next(err);
  }
});

router.post("/drafts", requireAuth, async (req, res, next) => {
  try {
    const parsed = draftSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid draft payload."
      });
    }

    const data = parsed.data;
    const draft = await prisma.draft.create({
      data: {
        userId: req.user.id,
        platform: data.platform,
        contentGoal: data.contentGoal,
        tone: data.tone,
        topic: data.topic,
        audience: data.audience || "",
        language: data.language || "en",
        caption: data.caption,
        hashtags: data.hashtags,
        shortHook: data.shortHook,
        callToAction: data.callToAction,
        generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date()
      }
    });

    return res.status(201).json({ ok: true, draft: serializeDraft(draft) });
  } catch (err) {
    next(err);
  }
});

router.delete("/drafts/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.draft.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Draft not found." });
    }
    await prisma.draft.delete({ where: { id: existing.id } });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
