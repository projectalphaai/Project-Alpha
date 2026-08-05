import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { runFfmpeg, extractThumbnail, probe, writeSrtFile } from "./ffmpeg.js";

/**
 * Sprint 12 — Viral Clip AI: renders the final 9:16 clip with a real ffmpeg filter
 * chain (crop -> optional zoom/pan -> burned captions -> optional fade transition).
 * Every stage is a genuine ffmpeg operation on the real source video — nothing here
 * is a placeholder render.
 */

const TARGET_ASPECT = 9 / 16;
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

/** Real crop-rectangle math from the source resolution + a heuristic horizontal center (0-1). */
export function computeCropRect(sourceWidth, sourceHeight, centerX = 0.5) {
  const width = Number(sourceWidth) || OUTPUT_WIDTH;
  const height = Number(sourceHeight) || OUTPUT_HEIGHT;
  const sourceAspect = width / height;

  let cropW;
  let cropH;
  let cropX;
  let cropY;

  if (sourceAspect > TARGET_ASPECT) {
    // Source is wider than 9:16 (typical landscape) — crop width, keep full height.
    cropH = height;
    cropW = Math.max(2, Math.round(cropH * TARGET_ASPECT) & ~1);
    const maxX = Math.max(0, width - cropW);
    cropX = Math.round(Math.min(maxX, Math.max(0, centerX * width - cropW / 2)));
    cropY = 0;
  } else {
    // Source is already narrower/taller than 9:16 — crop height, keep full width.
    // (The motion tracker is horizontal-only today, so vertical position is centered.)
    cropW = width;
    cropH = Math.max(2, Math.round(cropW / TARGET_ASPECT) & ~1);
    const maxY = Math.max(0, height - cropH);
    cropY = Math.round(maxY / 2);
    cropX = 0;
  }

  return { cropW, cropH, cropX, cropY };
}

function buildZoomPanFilter(zoom, durationSec) {
  const fps = 30;
  const totalFrames = Math.max(2, Math.round(durationSec * fps));
  const zStart = zoom === "in" ? 1.0 : 1.15;
  const zEnd = zoom === "in" ? 1.15 : 1.0;
  return (
    `zoompan=z='${zStart}+(${zEnd}-${zStart})*on/${totalFrames}':d=1:` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${fps}`
  );
}

/**
 * Renders one final clip.
 * @param captions caption cues with times RELATIVE TO THE CLIP START (0 = clip start).
 */
export async function renderClip({
  sourcePath,
  sourceWidth,
  sourceHeight,
  startSec,
  endSec,
  cropCenterX = 0.5,
  captions = [],
  style = {},
  outputPath,
  thumbnailPath
}) {
  const durationSec = Math.max(0.5, endSec - startSec);
  const { cropW, cropH, cropX, cropY } = computeCropRect(sourceWidth, sourceHeight, cropCenterX);

  const filters = [`crop=${cropW}:${cropH}:${cropX}:${cropY}`];

  const zoom = style?.zoom === "in" || style?.zoom === "out" ? style.zoom : "none";
  if (zoom !== "none") {
    filters.push(buildZoomPanFilter(zoom, durationSec));
  } else {
    filters.push(`scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`);
  }

  // The ffmpeg `subtitles` filter parses colons inside its path argument as option
  // separators, which breaks on Windows drive letters (e.g. "C:\..."). Rather than
  // fight filtergraph escaping rules, we run ffmpeg with its cwd set to the SRT's own
  // temp folder and reference it by filename only — sidesteps the colon entirely.
  const workDir = path.join(os.tmpdir(), `pa-clip-render-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(workDir, { recursive: true });
  let srtFilename = null;
  if (Array.isArray(captions) && captions.length > 0) {
    srtFilename = "captions.srt";
    writeSrtFile(
      captions.map((c) => ({ start: Math.max(0, c.start), end: Math.max(0, c.end), text: c.text })),
      path.join(workDir, srtFilename)
    );
    filters.push(
      `subtitles=${srtFilename}:force_style='FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=90'`
    );
  }

  const transition = style?.transition === "fade" ? "fade" : "none";
  if (transition === "fade") {
    const fadeDur = Math.min(0.6, durationSec / 4);
    filters.push(`fade=t=in:st=0:d=${fadeDur.toFixed(2)}`);
    filters.push(`fade=t=out:st=${Math.max(0, durationSec - fadeDur).toFixed(2)}:d=${fadeDur.toFixed(2)}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const absoluteSourcePath = path.resolve(sourcePath);
  const absoluteOutputPath = path.resolve(outputPath);

  try {
    await runFfmpeg(
      [
        "-y",
        "-ss",
        String(Math.max(0, startSec)),
        "-i",
        absoluteSourcePath,
        "-t",
        String(durationSec),
        "-vf",
        filters.join(","),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        absoluteOutputPath
      ],
      { cwd: workDir }
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  if (thumbnailPath) {
    await extractThumbnail(outputPath, thumbnailPath, Math.min(1, durationSec / 2));
  }

  const outputProbe = await probe(outputPath);
  return {
    durationSec: outputProbe.durationSec || durationSec,
    width: outputProbe.width || OUTPUT_WIDTH,
    height: outputProbe.height || OUTPUT_HEIGHT
  };
}

/** Extracts the transcript segments overlapping [startSec, endSec] as clip-relative caption cues. */
export function buildCaptionsForRange(transcriptSegments, startSec, endSec) {
  if (!Array.isArray(transcriptSegments)) return [];
  return transcriptSegments
    .filter((seg) => seg.end > startSec && seg.start < endSec)
    .map((seg) => ({
      start: Math.max(0, seg.start - startSec),
      end: Math.min(endSec - startSec, seg.end - startSec),
      text: seg.text
    }))
    .filter((cue) => cue.end > cue.start);
}
