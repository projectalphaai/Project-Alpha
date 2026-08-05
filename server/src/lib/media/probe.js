import fs from "fs";
import { imageSize } from "image-size";
import { parseFile } from "music-metadata";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v", "avi"]);

export function guessMediaType(mimeType = "", filename = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  const ext = String(filename).split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return "unknown";
}

/** Real dimension probing (pure JS, no native binary) — used for aspect-ratio/quality warnings. */
export function probeImageDimensions(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const { width, height } = imageSize(buffer);
    return { width: width || null, height: height || null };
  } catch (err) {
    console.warn("Image probe failed:", err?.message || err);
    return { width: null, height: null };
  }
}

/** Real duration probing via container metadata parsing (pure JS) — used for "video too long" warnings. */
export async function probeVideoDuration(filePath) {
  try {
    const metadata = await parseFile(filePath, { duration: true });
    const duration = metadata?.format?.duration || null;
    return { durationSec: duration ? Number(duration.toFixed(1)) : null };
  } catch (err) {
    console.warn("Video probe failed:", err?.message || err);
    return { durationSec: null };
  }
}

export async function probeMedia(filePath, type) {
  if (type === "image") {
    const { width, height } = probeImageDimensions(filePath);
    return { width, height, durationSec: null };
  }
  if (type === "video") {
    const { durationSec } = await probeVideoDuration(filePath);
    // Some containers also expose dimensions via music-metadata's video tags; best-effort only.
    return { width: null, height: null, durationSec };
  }
  return { width: null, height: null, durationSec: null };
}
