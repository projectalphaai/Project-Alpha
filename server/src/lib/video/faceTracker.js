import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { runFfmpeg } from "./ffmpeg.js";
import { config } from "../../config.js";

/**
 * Sprint 12 — Viral Clip AI: pluggable smart-crop / face-tracking interface.
 *
 * Mirrors the adapter-resolution pattern in server/src/lib/publishers/index.js.
 * Only "heuristic-motion" is implemented today: it downsamples real decoded video
 * frames and measures genuine frame-to-frame pixel motion per column to find the
 * most visually active horizontal region of the shot — a real, computed signal,
 * not a fabricated confidence score, and NOT literal face detection.
 *
 * clipRender.js only ever calls `resolveFaceTracker().resolveCropCenter(...)`, so a
 * real face-detection model (e.g. a TensorFlow.js-based tracker) can be registered
 * under a new FACE_TRACKER key later without touching any call sites.
 */

const SAMPLE_WIDTH = 64;
const SAMPLE_HEIGHT = 36;

async function extractGrayFrames(inputPath, { startSec, endSec, fps = 2 }) {
  const duration = Math.max(0.5, endSec - startSec);
  const outPath = path.join(os.tmpdir(), `pa-clip-frames-${crypto.randomBytes(6).toString("hex")}.raw`);
  await runFfmpeg([
    "-y",
    "-ss",
    String(Math.max(0, startSec)),
    "-i",
    inputPath,
    "-t",
    String(duration),
    "-vf",
    `scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:flags=area,fps=${fps},format=gray`,
    "-f",
    "rawvideo",
    outPath
  ]);
  if (!fs.existsSync(outPath)) return [];
  try {
    const buffer = fs.readFileSync(outPath);
    const frameSize = SAMPLE_WIDTH * SAMPLE_HEIGHT;
    const frameCount = Math.floor(buffer.length / frameSize);
    const frames = [];
    for (let i = 0; i < frameCount; i += 1) {
      frames.push(buffer.subarray(i * frameSize, (i + 1) * frameSize));
    }
    return frames;
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {
      // best effort cleanup
    }
  }
}

/** Real per-column frame-difference energy -> weighted-centroid crop center (0-1). */
function computeMotionCenterX(frames) {
  if (frames.length < 2) return 0.5;
  const columnEnergy = new Array(SAMPLE_WIDTH).fill(0);
  for (let f = 1; f < frames.length; f += 1) {
    const prev = frames[f - 1];
    const curr = frames[f];
    for (let y = 0; y < SAMPLE_HEIGHT; y += 1) {
      const rowOffset = y * SAMPLE_WIDTH;
      for (let x = 0; x < SAMPLE_WIDTH; x += 1) {
        const idx = rowOffset + x;
        columnEnergy[x] += Math.abs(curr[idx] - prev[idx]);
      }
    }
  }
  const totalEnergy = columnEnergy.reduce((a, b) => a + b, 0);
  if (totalEnergy <= 0) return 0.5; // no discernible motion — default to a centered crop
  let weightedSum = 0;
  for (let x = 0; x < SAMPLE_WIDTH; x += 1) {
    weightedSum += x * columnEnergy[x];
  }
  const centerColumn = weightedSum / totalEnergy;
  return Math.min(1, Math.max(0, centerColumn / (SAMPLE_WIDTH - 1)));
}

const trackers = {
  "heuristic-motion": {
    name: "heuristic-motion",
    label: "Motion-weighted smart crop (heuristic)",
    async resolveCropCenter(inputPath, { startSec, endSec }) {
      try {
        const frames = await extractGrayFrames(inputPath, { startSec, endSec, fps: 2 });
        const centerX = computeMotionCenterX(frames);
        return {
          centerX,
          method: "heuristic-motion",
          explanation:
            "Crop centered on the region with the most real frame-to-frame pixel motion during this clip. This is a motion heuristic, not literal face detection."
        };
      } catch (err) {
        console.warn("Smart crop motion analysis failed, defaulting to center crop:", err?.message || err);
        return {
          centerX: 0.5,
          method: "center-fallback",
          explanation: "Motion analysis was unavailable for this clip, so a centered crop was used."
        };
      }
    }
  }
};

export function resolveFaceTracker() {
  const key = config.clipAi.faceTracker;
  const tracker = trackers[key];
  if (tracker) return tracker;
  console.warn(`Unknown FACE_TRACKER="${key}", falling back to heuristic-motion.`);
  return trackers["heuristic-motion"];
}

export function listFaceTrackers() {
  return Object.values(trackers).map((t) => ({ name: t.name, label: t.label }));
}
