import { prisma } from "../prisma.js";
import { createOpenAIClient, getOpenAICostControls } from "../openai.js";

/**
 * Sprint 12 — Viral Clip AI: "Generate Similar Clips".
 *
 * Builds a similarity profile from REAL signals only:
 *  - If the source clip has live `ClipAnalyticsSnapshot` rows (real platform
 *    insights), the profile is built from those real metrics (share/save/comment
 *    rates, retention) — never simulated numbers.
 *  - Otherwise it falls back to the clip's own AI-detected moment-type/pacing/
 *    hook-score signals, and is explicitly labeled "based on AI-detected content
 *    signals only" so it's never confused with real performance data.
 *
 * Candidate sibling moments are ranked by similarity to that profile; one GPT
 * call (optional, gracefully degrades) produces a transparent explanation
 * grounded only in the real signals collected above.
 */

function safeParseJson(str, fallback) {
  try {
    const parsed = JSON.parse(str);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function getLatestSnapshotMetrics(clipId) {
  const publications = await prisma.clipPublication.findMany({
    where: { clipId },
    include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } }
  });
  const snapshots = publications.map((p) => p.snapshots[0]).filter(Boolean);
  if (snapshots.length === 0) return null;

  const sum = (key) => snapshots.reduce((acc, s) => acc + (Number(s[key]) || 0), 0);
  const retentionSamples = snapshots.filter((s) => s.retentionPct != null);

  return {
    views: sum("views"),
    watchTimeSec: sum("watchTimeSec"),
    shares: sum("shares"),
    saves: sum("saves"),
    comments: sum("comments"),
    reach: sum("reach"),
    followersGained: sum("followersGained"),
    retentionPct:
      retentionSamples.length > 0
        ? retentionSamples.reduce((acc, s) => acc + s.retentionPct, 0) / retentionSamples.length
        : null,
    sampleCount: snapshots.length
  };
}

function buildContentProfile(clip, moments) {
  const typeCounts = {};
  for (const m of moments) typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
  const dominantType =
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "hook";
  const avgScore = moments.length
    ? moments.reduce((acc, m) => acc + m.score, 0) / moments.length
    : 50;
  return {
    dominantType,
    avgScore,
    durationSec: clip.durationSec || Math.max(1, clip.endSec - clip.startSec),
    typeCounts
  };
}

export async function buildSimilarityProfile(clipId) {
  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip) {
    const e = new Error("Clip not found");
    e.status = 404;
    throw e;
  }

  const momentIds = safeParseJson(clip.momentIdsJson, []);
  const moments = momentIds.length
    ? await prisma.clipMoment.findMany({ where: { id: { in: momentIds } } })
    : [];

  const contentProfile = buildContentProfile(clip, moments);
  const metrics = await getLatestSnapshotMetrics(clipId);

  if (metrics && metrics.views > 0) {
    const rates = {
      shareRate: metrics.shares / metrics.views,
      saveRate: metrics.saves / metrics.views,
      commentRate: metrics.comments / metrics.views,
      retention: metrics.retentionPct || 0
    };
    const topSignal = Object.entries(rates).sort((a, b) => b[1] - a[1])[0]?.[0] || "shareRate";
    return { basis: "real-analytics", clip, metrics, rates, topSignal, contentProfile };
  }

  return { basis: "content-signals-only", clip, contentProfile };
}

/** Ranks sibling ClipMoments (this user's sources) by similarity to the profile. */
export async function findSimilarMomentCandidates({ userId, excludeMomentIds = [], profile, limit = 5 }) {
  const candidateMoments = await prisma.clipMoment.findMany({
    where: {
      source: { userId },
      id: { notIn: excludeMomentIds.length ? excludeMomentIds : ["__none__"] }
    },
    include: { source: { select: { id: true, title: true, status: true } } },
    orderBy: { score: "desc" },
    take: 300
  });

  const { dominantType, avgScore, durationSec } = profile.contentProfile;

  const scored = candidateMoments
    .filter((m) => m.source.status === "ready")
    .map((m) => {
      let similarity = 0;
      if (m.type === dominantType) similarity += 50;
      similarity += Math.max(0, 30 - Math.abs(m.score - avgScore) * 0.5);
      const momentDuration = Math.max(0.1, m.endSec - m.startSec);
      similarity += Math.max(0, 20 - Math.abs(momentDuration - durationSec));
      return { moment: m, similarity: Math.round(Math.min(100, similarity)) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return scored;
}

function buildFallbackExplanation(profile) {
  if (profile.basis === "real-analytics") {
    const pct = (n) => `${Math.round(n * 100)}%`;
    return (
      `Based on real analytics: ${profile.metrics.views} views, ${profile.metrics.shares} shares (${pct(
        profile.rates.shareRate
      )} of views), ${profile.metrics.saves} saves. Top real signal: ${profile.topSignal}.`
    );
  }
  return `Based on AI-detected content signals only (no live analytics yet): dominant moment type "${profile.contentProfile.dominantType}" with an average heuristic strength of ${Math.round(profile.contentProfile.avgScore)}/100.`;
}

async function explainWhyItWorked(profile) {
  let client;
  try {
    client = createOpenAIClient();
  } catch {
    return buildFallbackExplanation(profile);
  }

  const controls = getOpenAICostControls();
  const prompt =
    profile.basis === "real-analytics"
      ? `Real performance metrics for this clip: ${JSON.stringify(profile.metrics)}. Real engagement rates: ${JSON.stringify(
          profile.rates
        )}. Dominant AI-detected content type: ${profile.contentProfile.dominantType}. In 2-3 sentences, explain honestly why this clip likely performed well, grounded ONLY in these real numbers. Do not invent any data not given.`
      : `No live analytics exist yet for this clip. AI-detected content profile only: dominant moment type "${profile.contentProfile.dominantType}", average heuristic strength ${Math.round(
          profile.contentProfile.avgScore
        )}/100, duration ${profile.contentProfile.durationSec.toFixed(1)}s. In 1-2 sentences, explain what content signals this clip is built from. You MUST clearly state this is based on AI-detected content signals only, not real performance data.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), controls.timeoutMs);
  try {
    const response = await client.responses.create(
      {
        model: controls.model,
        instructions:
          "You are a data-honest short-form video analyst. Never fabricate metrics beyond what is explicitly given to you.",
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        max_output_tokens: 220
      },
      { signal: controller.signal }
    );
    const text = String(response.output_text || "").trim();
    return text || buildFallbackExplanation(profile);
  } catch (err) {
    console.warn("Similar-clips explanation generation failed:", err?.message || err);
    return buildFallbackExplanation(profile);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full pipeline: build the profile, rank real sibling moment candidates, and produce
 * an honest explanation. Does not create Clip rows itself — the route layer decides
 * which candidates/platforms to actually fan out into new clips.
 */
export async function generateSimilarClips({ userId, clipId, count = 3 }) {
  const clip = await prisma.clip.findFirst({ where: { id: clipId, userId } });
  if (!clip) {
    const e = new Error("Clip not found");
    e.status = 404;
    throw e;
  }

  const profile = await buildSimilarityProfile(clipId);
  const excludeMomentIds = safeParseJson(clip.momentIdsJson, []);
  const [candidates, explanation] = await Promise.all([
    findSimilarMomentCandidates({ userId, excludeMomentIds, profile, limit: count }),
    explainWhyItWorked(profile)
  ]);

  return {
    basis: profile.basis,
    explanation,
    sourceClipId: clip.id,
    candidates: candidates.map((c) => ({
      momentId: c.moment.id,
      sourceId: c.moment.sourceId,
      sourceTitle: c.moment.source.title,
      type: c.moment.type,
      startSec: c.moment.startSec,
      endSec: c.moment.endSec,
      score: c.moment.score,
      explanation: c.moment.explanation,
      similarity: c.similarity
    }))
  };
}
