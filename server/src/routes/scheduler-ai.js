import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/entitlement.js";
import { generateContentVariants } from "../lib/schedulerAi.js";

const router = Router();

const platforms = ["instagram", "facebook", "linkedin", "x", "youtube", "tiktok", "pinterest"];

const contentBoxLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AI_CONTENT_BOX_RATE_LIMIT || 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "AI rate limit exceeded. Please wait and try again." }
});

const contentBoxSchema = z.object({
  platform: z.enum(platforms, { errorMap: () => ({ message: "Select a valid platform." }) }),
  prompt: z.string().trim().min(3, "Prompt must be at least 3 characters.").max(500)
});

router.post("/content-box", requireAuth, requireEntitlement, contentBoxLimiter, async (req, res) => {
  try {
    const parsed = contentBoxSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid request." });
    }

    const result = await generateContentVariants(parsed.data);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("AI content box failed:", err?.name || "Error", err?.status || "");
    const status = err.status || 502;
    const message =
      status === 503 || status === 429 || status === 504 || status === 400
        ? err.message
        : "AI content generation failed. Please try again.";
    return res.status(status).json({ ok: false, error: message });
  }
});

export default router;
