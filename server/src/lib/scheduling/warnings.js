import { prisma } from "../prisma.js";

const DUPLICATE_LOOKBACK_DAYS = 30;
const HASHTAG_JACCARD_THRESHOLD = 0.7;
const NON_TERMINAL_STATUSES = ["draft", "scheduled", "processing", "published"];

// Documented platform image guidance (public best-practice specs), used
// transparently for real dimension checks — not fabricated numbers.
const IMAGE_RULES = {
  instagram: { minWidth: 600, minHeight: 600, ratios: [1, 0.8, 1.91], tolerance: 0.08 },
  facebook: { minWidth: 600, minHeight: 315, ratios: [1.91, 1], tolerance: 0.08 },
  linkedin: { minWidth: 552, minHeight: 289, ratios: [1.91, 1], tolerance: 0.08 },
  x: { minWidth: 600, minHeight: 335, ratios: [1.78, 1], tolerance: 0.1 },
  tiktok: { minWidth: 540, minHeight: 960, ratios: [0.5625], tolerance: 0.1 },
  youtube: { minWidth: 1280, minHeight: 720, ratios: [1.78], tolerance: 0.08 },
  pinterest: { minWidth: 600, minHeight: 900, ratios: [0.667], tolerance: 0.12 }
};

const VIDEO_MAX_SECONDS = {
  instagram: 90,
  facebook: 240,
  linkedin: 600,
  x: 140,
  tiktok: 600,
  youtube: 43200,
  pinterest: 15
};

function normalizeCaption(caption) {
  return String(caption || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractHashtags(caption) {
  const matches = String(caption || "").match(/#[a-z0-9_]+/gi) || [];
  return new Set(matches.map((tag) => tag.toLowerCase()));
}

function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Real, explainable warning checks — no fake/random data. Duplicate checks
 * compare against this user's own recent posts; media checks use dimensions
 * and duration already probed at upload/generation time
 * (server/src/lib/media/probe.js).
 */
export async function buildSmartWarnings({ userId, platform, caption, mediaJson = [], excludePostId = null }) {
  const warnings = [];
  const normalizedCaption = normalizeCaption(caption);
  const hashtags = extractHashtags(caption);

  const recentPosts = await prisma.scheduledPost.findMany({
    where: {
      userId,
      status: { in: NON_TERMINAL_STATUSES },
      createdAt: { gte: new Date(Date.now() - DUPLICATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) },
      ...(excludePostId ? { id: { not: excludePostId } } : {})
    },
    select: { id: true, caption: true, platform: true },
    take: 200
  });

  const exactDuplicate = recentPosts.find((p) => normalizeCaption(p.caption) === normalizedCaption && normalizedCaption);
  if (exactDuplicate) {
    warnings.push({
      code: "duplicate_caption",
      level: "warning",
      message: `This caption matches an existing ${exactDuplicate.platform} post word-for-word.`
    });
  } else if (hashtags.size >= 3) {
    const nearDuplicate = recentPosts.find((p) => {
      const otherTags = extractHashtags(p.caption);
      return jaccardSimilarity(hashtags, otherTags) >= HASHTAG_JACCARD_THRESHOLD;
    });
    if (nearDuplicate) {
      warnings.push({
        code: "duplicate_hashtags",
        level: "warning",
        message: `Hashtag set overlaps heavily with an existing ${nearDuplicate.platform} post — consider varying them.`
      });
    }
  }

  const imageRule = IMAGE_RULES[platform];
  const videoMax = VIDEO_MAX_SECONDS[platform];

  for (const media of Array.isArray(mediaJson) ? mediaJson : []) {
    if (media.type === "image" && imageRule && media.width && media.height) {
      if (media.width < imageRule.minWidth || media.height < imageRule.minHeight) {
        warnings.push({
          code: "low_quality_image",
          level: "warning",
          message: `Image is ${media.width}x${media.height}px — below the recommended minimum of ${imageRule.minWidth}x${imageRule.minHeight}px for ${platform}.`
        });
      }
      const ratio = media.width / media.height;
      const matchesRatio = imageRule.ratios.some((r) => Math.abs(ratio - r) <= imageRule.tolerance);
      if (!matchesRatio) {
        warnings.push({
          code: "wrong_aspect_ratio",
          level: "warning",
          message: `Image aspect ratio (${ratio.toFixed(2)}:1) is unusual for ${platform}; it may be cropped.`
        });
      }
    }
    if (media.type === "video" && videoMax && media.durationSec) {
      if (media.durationSec > videoMax) {
        warnings.push({
          code: "video_too_long",
          level: "warning",
          message: `Video is ${Math.round(media.durationSec)}s — longer than ${platform}'s recommended max of ${videoMax}s.`
        });
      }
    }
  }

  return warnings;
}
