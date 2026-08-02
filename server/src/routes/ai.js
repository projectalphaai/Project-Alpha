import { Router } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const generateSchema = z.object({
  platform: z.enum(["instagram", "facebook", "linkedin", "x", "youtube"]),
  goal: z.enum(["awareness", "engagement", "leads", "launch", "education"]),
  tone: z.enum(["professional", "friendly", "bold", "witty", "inspirational"]),
  topic: z.string().trim().min(3).max(160)
});

function assertOpenAIConfigured() {
  if (!config.openai.apiKey) {
    const err = new Error("OpenAI is not configured. Set OPENAI_API_KEY in your environment.");
    err.status = 503;
    throw err;
  }
}

function getClient() {
  assertOpenAIConfigured();
  return new OpenAI({ apiKey: config.openai.apiKey });
}

router.post("/generate", requireAuth, async (req, res, next) => {
  try {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid generation request."
      });
    }

    const { platform, goal, tone, topic } = parsed.data;
    const client = getClient();

    const completion = await client.chat.completions.create({
      model: config.openai.model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Project Alpha AI, an expert social media copywriter. Return strict JSON with keys caption (string) and hashtags (string of space-separated hashtags). No markdown."
        },
        {
          role: "user",
          content: `Write a ${tone} ${platform} post for goal "${goal}" about: ${topic}.
Caption should be ready to publish. Include a clear hook and CTA.
Provide 6-10 relevant hashtags in the hashtags field.`
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(502).json({ ok: false, error: "OpenAI returned an unreadable response." });
    }

    const caption = String(payload.caption || "").trim();
    const hashtags = String(payload.hashtags || "").trim();
    if (!caption || !hashtags) {
      return res.status(502).json({ ok: false, error: "OpenAI response was incomplete." });
    }

    return res.json({
      ok: true,
      result: {
        platform,
        goal,
        tone,
        topic,
        caption,
        hashtags,
        model: completion.model
      }
    });
  } catch (err) {
    if (err?.status === 503) {
      return res.status(503).json({ ok: false, error: err.message });
    }
    if (err?.status === 401 || err?.code === "invalid_api_key") {
      return res.status(502).json({ ok: false, error: "OpenAI API key is invalid." });
    }
    next(err);
  }
});

router.get("/drafts", requireAuth, async (req, res, next) => {
  try {
    const drafts = await prisma.contentDraft.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    return res.json({
      ok: true,
      drafts: drafts.map((d) => ({
        id: d.id,
        platform: d.platform,
        goal: d.goal,
        tone: d.tone,
        topic: d.topic,
        caption: d.caption,
        hashtags: d.hashtags,
        savedAt: d.createdAt.toISOString()
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.post("/drafts", requireAuth, async (req, res, next) => {
  try {
    const parsed = generateSchema
      .extend({
        caption: z.string().trim().min(1).max(4000),
        hashtags: z.string().trim().min(1).max(1000)
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid draft payload." });
    }

    const draft = await prisma.contentDraft.create({
      data: {
        userId: req.user.id,
        platform: parsed.data.platform,
        goal: parsed.data.goal,
        tone: parsed.data.tone,
        topic: parsed.data.topic,
        caption: parsed.data.caption,
        hashtags: parsed.data.hashtags
      }
    });

    return res.status(201).json({
      ok: true,
      draft: {
        id: draft.id,
        platform: draft.platform,
        goal: draft.goal,
        tone: draft.tone,
        topic: draft.topic,
        caption: draft.caption,
        hashtags: draft.hashtags,
        savedAt: draft.createdAt.toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
