import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { transcribeVideo } from "../lib/video/transcribe.js";
import { detectMoments } from "../lib/video/momentDetection.js";
import { resolveFaceTracker } from "../lib/video/faceTracker.js";
import { renderClip, buildCaptionsForRange } from "../lib/video/clipRender.js";
import {
  absolutePathFromClipUrl,
  absolutePathForClipFile,
  publicUrlForClipFile,
  generateClipFilename
} from "../lib/video/storage.js";
import { logActivity } from "../lib/activity.js";

/**
 * Sprint 12 — Viral Clip AI background worker. Same interval-polling shape as
 * server/src/worker/publisherWorker.js (imported read-only, never modified):
 * claims ClipSource rows needing transcription/analysis, and Clip rows needing
 * render, then calls the real video-processing libs and updates status/error.
 */

let timer = null;
let ticking = false;

function safeParseJson(str, fallback) {
  try {
    const parsed = JSON.parse(str);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function claimSources(limit) {
  const candidates = await prisma.clipSource.findMany({
    where: { status: "uploaded" },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  const claimed = [];
  for (const row of candidates) {
    const result = await prisma.clipSource.updateMany({
      where: { id: row.id, status: "uploaded" },
      data: { status: "transcribing" }
    });
    if (result.count === 1) claimed.push(row);
  }
  return claimed;
}

async function processSource(source) {
  const filePath = absolutePathFromClipUrl(source.url, source.userId);
  try {
    const transcript = await transcribeVideo(filePath);
    await prisma.clipSource.update({
      where: { id: source.id },
      data: { status: "analyzing", transcriptJson: JSON.stringify(transcript) }
    });

    const moments = await detectMoments({ videoPath: filePath, transcriptSegments: transcript.segments });
    if (moments.length > 0) {
      await prisma.clipMoment.createMany({
        data: moments.map((m) => ({
          sourceId: source.id,
          type: m.type,
          startSec: m.startSec,
          endSec: m.endSec,
          score: m.score,
          explanation: m.explanation
        }))
      });
    }

    await prisma.clipSource.update({
      where: { id: source.id },
      data: { status: "ready", analyzedAt: new Date(), errorMessage: "" }
    });

    await logActivity({
      userId: source.userId,
      type: "clip_source_ready",
      message: `Clip source "${source.title || source.id}" analyzed: ${moments.length} moment(s) detected`,
      meta: { sourceId: source.id, momentCount: moments.length, transcriptPartial: Boolean(transcript.partial) }
    });
  } catch (err) {
    const message = String(err?.message || err).slice(0, 500);
    console.error("Clip source processing failed:", message);
    await prisma.clipSource.update({
      where: { id: source.id },
      data: { status: "failed", errorMessage: message }
    });
    await logActivity({
      userId: source.userId,
      type: "clip_source_failed",
      message: `Clip source analysis failed: ${message}`,
      meta: { sourceId: source.id }
    });
  }
}

async function claimClips(limit) {
  const candidates = await prisma.clip.findMany({
    where: { renderStatus: "queued" },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  const claimed = [];
  for (const row of candidates) {
    const result = await prisma.clip.updateMany({
      where: { id: row.id, renderStatus: "queued" },
      data: { renderStatus: "rendering" }
    });
    if (result.count === 1) claimed.push(row);
  }
  return claimed;
}

async function processClip(clip) {
  try {
    const source = await prisma.clipSource.findUnique({ where: { id: clip.sourceId } });
    if (!source) throw new Error("Source video not found.");

    const sourcePath = absolutePathFromClipUrl(source.url, source.userId);
    const transcript = safeParseJson(source.transcriptJson, { segments: [] });
    const captions = buildCaptionsForRange(transcript.segments || [], clip.startSec, clip.endSec);

    const tracker = resolveFaceTracker();
    const cropResult = await tracker.resolveCropCenter(sourcePath, {
      startSec: clip.startSec,
      endSec: clip.endSec
    });

    const style = safeParseJson(clip.styleJson, {});
    const filename = generateClipFilename(".mp4");
    const thumbFilename = generateClipFilename(".jpg");
    const outputPath = absolutePathForClipFile(clip.userId, filename);
    const thumbnailPath = absolutePathForClipFile(clip.userId, thumbFilename);

    const rendered = await renderClip({
      sourcePath,
      sourceWidth: source.width,
      sourceHeight: source.height,
      startSec: clip.startSec,
      endSec: clip.endSec,
      cropCenterX: cropResult.centerX,
      captions,
      style,
      outputPath,
      thumbnailPath
    });

    const existingExplanation = safeParseJson(clip.aiExplanationJson, {});

    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        renderStatus: "ready",
        outputUrl: publicUrlForClipFile(clip.userId, filename),
        thumbnailUrl: publicUrlForClipFile(clip.userId, thumbFilename),
        durationSec: rendered.durationSec,
        errorMessage: "",
        aiExplanationJson: JSON.stringify({
          ...existingExplanation,
          cropMethod: cropResult.method,
          cropExplanation: cropResult.explanation
        })
      }
    });

    await logActivity({
      userId: clip.userId,
      type: "clip_rendered",
      message: `Clip "${clip.title || clip.id}" rendered for ${clip.platform}`,
      meta: { clipId: clip.id, platform: clip.platform, durationSec: rendered.durationSec }
    });
  } catch (err) {
    const message = String(err?.message || err).slice(0, 500);
    console.error("Clip render failed:", message);
    await prisma.clip.update({
      where: { id: clip.id },
      data: { renderStatus: "failed", errorMessage: message }
    });
    await logActivity({
      userId: clip.userId,
      type: "clip_render_failed",
      message: `Clip render failed: ${message}`,
      meta: { clipId: clip.id }
    });
  }
}

export async function runClipCycle({ sourceBatchSize = 2, clipBatchSize = 2 } = {}) {
  const sources = await claimSources(sourceBatchSize);
  for (const source of sources) {
    await processSource(source);
  }
  const clips = await claimClips(clipBatchSize);
  for (const clip of clips) {
    await processClip(clip);
  }
  return { sourcesProcessed: sources.length, clipsProcessed: clips.length };
}

export function startClipWorker() {
  if (timer) return { stop: stopClipWorker };
  const intervalMs = config.clipAi.workerIntervalMs;
  console.log(`Clip AI worker started (interval=${intervalMs}ms)`);

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await runClipCycle();
    } catch (err) {
      console.error("Clip worker cycle failed:", err?.message || err);
    } finally {
      ticking = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  const initial = setTimeout(tick, 1000);
  if (typeof initial.unref === "function") initial.unref();

  return { stop: stopClipWorker };
}

export function stopClipWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
