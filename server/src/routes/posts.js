import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const postSchema = z.object({
  platform: z.enum(["instagram", "facebook", "linkedin", "x", "youtube"]),
  caption: z.string().trim().min(10).max(2200),
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  mediaUrl: z.string().url().optional().or(z.literal(""))
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
    createdAt: post.createdAt.toISOString()
  };
}

function toLocalInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function parseScheduleDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const posts = await prisma.scheduledPost.findMany({
      where: { userId: req.user.id },
      orderBy: { scheduledAt: "asc" }
    });
    return res.json({ ok: true, posts: posts.map(serializePost) });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid post." });
    }

    const scheduledAt = parseScheduleDate(parsed.data.scheduledAt);
    if (!scheduledAt || scheduledAt <= new Date()) {
      return res.status(400).json({ ok: false, error: "Choose a future date and time." });
    }

    const post = await prisma.scheduledPost.create({
      data: {
        userId: req.user.id,
        platform: parsed.data.platform,
        caption: parsed.data.caption,
        mediaUrl: parsed.data.mediaUrl || "",
        scheduledAt,
        status: "scheduled"
      }
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
      return res.status(404).json({ ok: false, error: "Scheduled post not found." });
    }

    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid post." });
    }

    const scheduledAt = parseScheduleDate(parsed.data.scheduledAt);
    if (!scheduledAt || scheduledAt <= new Date()) {
      return res.status(400).json({ ok: false, error: "Choose a future date and time." });
    }

    const post = await prisma.scheduledPost.update({
      where: { id: existing.id },
      data: {
        platform: parsed.data.platform,
        caption: parsed.data.caption,
        mediaUrl: parsed.data.mediaUrl || "",
        scheduledAt,
        status: "scheduled"
      }
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
      return res.status(404).json({ ok: false, error: "Scheduled post not found." });
    }

    await prisma.scheduledPost.delete({ where: { id: existing.id } });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
