import { prisma } from "../prisma.js";

/**
 * Heuristic AI Score + Smart Time engine.
 *
 * This is intentionally NOT a trained ML model — there is no real per-post
 * engagement dataset (likes/comments/reach) captured anywhere in the app
 * yet. Every number here is derived from (a) documented, publicly known
 * platform posting-time research, (b) this account's own historical publish
 * success/failure record, and (c) simple, explainable caption/hashtag
 * heuristics. The UI labels this "Heuristic AI Score" and always surfaces
 * the `explanation` array so nothing is presented as a black-box prediction.
 */

// Hour-of-day weights (0-1), local to the account's timezone. Sourced from
// widely cited platform posting-time research; used only as a starting
// prior, real historical data (below) is blended in when available.
const BEST_HOURS_BY_PLATFORM = {
  instagram: hourWeights([11, 12, 13, 19, 20, 21]),
  facebook: hourWeights([13, 14, 15, 16]),
  linkedin: hourWeights([8, 9, 10, 12]),
  x: hourWeights([9, 12, 15, 17]),
  tiktok: hourWeights([6, 7, 8, 19, 20, 21, 22]),
  youtube: hourWeights([14, 15, 16, 18, 19, 20]),
  pinterest: hourWeights([20, 21, 22, 23])
};

const PLATFORM_REACH_BASELINE = {
  instagram: 70,
  tiktok: 75,
  youtube: 65,
  facebook: 55,
  pinterest: 55,
  x: 50,
  linkedin: 50
};

function hourWeights(peakHours) {
  const weights = new Array(24).fill(0.25);
  for (const h of peakHours) weights[h] = 1;
  // Smooth neighbours of each peak hour so the curve isn't spiky.
  for (const h of peakHours) {
    weights[(h + 23) % 24] = Math.max(weights[(h + 23) % 24], 0.6);
    weights[(h + 1) % 24] = Math.max(weights[(h + 1) % 24], 0.6);
  }
  return weights;
}

function hourInTimezone(date, timezone) {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone || "UTC"
    }).format(date);
    const hour = Number(formatted.replace(/[^0-9]/g, ""));
    return Number.isFinite(hour) ? hour % 24 : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

function formatHourLabel(hour) {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

async function historicalSuccessRate(userId, platform) {
  const rows = await prisma.scheduledPost.groupBy({
    by: ["status"],
    where: { userId, platform, status: { in: ["published", "failed"] } },
    _count: { status: true }
  });
  const published = rows.find((r) => r.status === "published")?._count.status || 0;
  const failed = rows.find((r) => r.status === "failed")?._count.status || 0;
  const total = published + failed;
  if (total < 3) return null; // not enough real history to be meaningful
  return { rate: published / total, sample: total };
}

async function historicalBestHours(userId, platform) {
  const rows = await prisma.scheduledPost.findMany({
    where: { userId, platform, status: "published", publishedAt: { not: null } },
    select: { publishedAt: true },
    take: 200
  });
  if (rows.length < 5) return null;
  const counts = new Array(24).fill(0);
  for (const row of rows) counts[row.publishedAt.getUTCHours()] += 1;
  const max = Math.max(...counts);
  if (max === 0) return null;
  return counts.map((c) => c / max);
}

function captionHeuristics(caption) {
  const trimmed = String(caption || "").trim();
  const hashtagCount = (trimmed.match(/#[a-z0-9_]+/gi) || []).length;
  const length = trimmed.length;
  const explanation = [];
  let score = 50;

  if (hashtagCount >= 3 && hashtagCount <= 8) {
    score += 15;
    explanation.push(`Caption includes ${hashtagCount} hashtags — within the recommended 3-8 range.`);
  } else if (hashtagCount > 8) {
    score -= 10;
    explanation.push(`Caption includes ${hashtagCount} hashtags — more than the recommended 3-8, which can look spammy.`);
  } else {
    explanation.push(`Caption includes ${hashtagCount} hashtag(s) — consider adding a few more (3-8 is typical).`);
  }

  if (length >= 60 && length <= 300) {
    score += 10;
    explanation.push("Caption length is in a well-read range (60-300 characters).");
  } else if (length > 300) {
    explanation.push("Caption is long — good for storytelling, but may get truncated in feed previews.");
  }

  return { score: Math.max(0, Math.min(100, score)), hashtagCount, length, explanation };
}

export async function computeHeuristicScore({ userId, platform, caption, scheduledAt, mediaJson = [], timezone = "UTC" }) {
  const hour = hourInTimezone(new Date(scheduledAt), timezone);
  const weights = BEST_HOURS_BY_PLATFORM[platform] || BEST_HOURS_BY_PLATFORM.instagram;
  const timeScore = Math.round(weights[hour] * 100);

  const [history, contentSignal] = await Promise.all([
    historicalSuccessRate(userId, platform),
    Promise.resolve(captionHeuristics(caption))
  ]);

  const engagementBase = history ? Math.round(history.rate * 100) : 50;
  const reachBaseline = PLATFORM_REACH_BASELINE[platform] || 55;
  const hasMedia = Array.isArray(mediaJson) && mediaJson.length > 0;

  const reachScore = clamp(
    Math.round(timeScore * 0.4 + reachBaseline * 0.35 + contentSignal.score * 0.15 + (hasMedia ? 10 : 0))
  );
  const engagementScore = clamp(
    Math.round(engagementBase * 0.45 + contentSignal.score * 0.35 + timeScore * 0.2)
  );
  const viralityScore = clamp(
    Math.round(timeScore * 0.3 + contentSignal.score * 0.3 + reachBaseline * 0.25 + (hasMedia ? 15 : 0))
  );

  const bestHourIndex = weights.indexOf(Math.max(...weights));

  const explanation = [
    `Posting hour ${formatHourLabel(hour)} scores ${timeScore}/100 for ${platform} based on published audience-activity research.`,
    ...contentSignal.explanation,
    history
      ? `Your account's ${platform} publish success rate is ${Math.round(history.rate * 100)}% over ${history.sample} past posts.`
      : `Not enough publish history on ${platform} yet to personalize this score — using platform-level research only.`,
    hasMedia ? "Media attached, which typically improves reach for this platform." : "No media attached — adding an image or video usually improves reach.",
    "This is a heuristic estimate from real inputs, not a trained ML prediction."
  ];

  return {
    reachScore,
    engagementScore,
    viralityScore,
    bestHour: formatHourLabel(bestHourIndex),
    bestHour24: bestHourIndex,
    explanation,
    basis: history ? "platform research + your publish history" : "platform research"
  };
}

export async function suggestSmartTime({ userId, platform, timezone = "UTC" }) {
  const staticWeights = BEST_HOURS_BY_PLATFORM[platform] || BEST_HOURS_BY_PLATFORM.instagram;
  const historyWeights = await historicalBestHours(userId, platform);

  const blended = staticWeights.map((w, i) => (historyWeights ? w * 0.5 + historyWeights[i] * 0.5 : w));
  const ranked = blended
    .map((weight, hour) => ({ hour, weight }))
    .sort((a, b) => b.weight - a.weight);

  const top = ranked.slice(0, 3);

  return {
    bestHour: top[0].hour,
    bestHourLabel: formatHourLabel(top[0].hour),
    alternatives: top.slice(1).map((t) => ({ hour: t.hour, label: formatHourLabel(t.hour) })),
    basis: historyWeights ? "platform research + your publish history" : "platform research",
    timezone,
    explanation: [
      `Best local hour for ${platform} is ${formatHourLabel(top[0].hour)}, in timezone ${timezone}.`,
      historyWeights
        ? "Blended with your account's own published-post hour distribution."
        : "Based on platform-level research only — publish more posts on this platform to personalize this."
    ]
  };
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}
