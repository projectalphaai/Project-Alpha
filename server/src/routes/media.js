import fs from "fs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/entitlement.js";
import { uploadMedia, publicUrlForUpload, absolutePathForUpload } from "../lib/media/upload.js";
import { probeMedia, guessMediaType } from "../lib/media/probe.js";
import { generateAIImage } from "../lib/media/imageGen.js";

const router = Router();

const imageGenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AI_IMAGE_RATE_LIMIT || 15),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "AI image rate limit exceeded. Please wait and try again." }
});

function serializeAsset(asset) {
  return {
    id: asset.id,
    type: asset.type,
    url: asset.url,
    source: asset.source,
    prompt: asset.prompt || "",
    width: asset.width || null,
    height: asset.height || null,
    durationSec: asset.durationSec || null,
    sizeBytes: asset.sizeBytes || null,
    mimeType: asset.mimeType || "",
    createdAt: asset.createdAt.toISOString()
  };
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const assets = await prisma.mediaAsset.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return res.json({ ok: true, assets: assets.map(serializeAsset) });
  } catch (err) {
    next(err);
  }
});

router.post("/upload", requireAuth, (req, res, next) => {
  uploadMedia.array("files", 10)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || "Upload failed." });
    }
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ ok: false, error: "No files uploaded." });
      }

      const assets = [];
      for (const file of files) {
        const type = guessMediaType(file.mimetype, file.originalname);
        const probed = await probeMedia(file.path, type);
        const asset = await prisma.mediaAsset.create({
          data: {
            userId: req.user.id,
            type,
            url: publicUrlForUpload(req.user.id, file.filename),
            source: "upload",
            width: probed.width,
            height: probed.height,
            durationSec: probed.durationSec,
            sizeBytes: file.size,
            mimeType: file.mimetype || ""
          }
        });
        assets.push(asset);
      }

      return res.status(201).json({ ok: true, assets: assets.map(serializeAsset) });
    } catch (err2) {
      next(err2);
    }
  });
});

const generateImageSchema = z.object({
  prompt: z.string().trim().min(3, "Describe the image you want.").max(1000)
});

router.post("/generate-image", requireAuth, requireEntitlement, imageGenLimiter, async (req, res) => {
  try {
    const parsed = generateImageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid prompt." });
    }

    const result = await generateAIImage({ userId: req.user.id, prompt: parsed.data.prompt });
    const asset = await prisma.mediaAsset.create({
      data: {
        userId: req.user.id,
        type: "image",
        url: result.url,
        source: "ai-generated",
        prompt: parsed.data.prompt,
        width: result.width,
        height: result.height,
        mimeType: result.mimeType
      }
    });

    return res.status(201).json({ ok: true, asset: serializeAsset(asset) });
  } catch (err) {
    console.error("AI image generation failed:", err?.name || "Error", err?.status || "");
    const status = err.status || 502;
    const message = status === 503 || status === 429 ? err.message : "AI image generation failed. Please try again.";
    return res.status(status).json({ ok: false, error: message });
  }
});

/** Honest "coming soon" placeholder — no fake video is ever produced or claimed. */
router.post("/generate-video", requireAuth, requireEntitlement, (_req, res) => {
  return res.status(501).json({
    ok: false,
    comingSoon: true,
    error: "AI video generation is coming in a future sprint. Upload a video instead for now."
  });
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.mediaAsset.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Media asset not found." });
    }

    await prisma.mediaAsset.delete({ where: { id: existing.id } });

    try {
      const filename = existing.url.split("/").pop();
      const filePath = absolutePathForUpload(req.user.id, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (fileErr) {
      console.warn("Failed to remove media file from disk:", fileErr?.message || fileErr);
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
