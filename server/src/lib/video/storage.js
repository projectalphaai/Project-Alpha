import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { config } from "../../config.js";

/**
 * Sprint 12 — Viral Clip AI: dedicated storage helpers for source uploads and
 * rendered clip outputs. Kept self-contained (does not modify the Sprint 11
 * server/src/lib/media/upload.js) but reuses the same uploads root/base URL
 * convention from config.scheduler, under a "clips" subfolder.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/lib/video -> project root (4 levels up), same depth as
// server/src/lib/media, so files land under <root>/uploads/clips and are
// served by the existing express.static(rootDir) in app.js.
const rootDir = path.resolve(__dirname, "../../../..");
export const clipUploadsRootDir = path.join(rootDir, config.scheduler.uploadDir, "clips");

fs.mkdirSync(clipUploadsRootDir, { recursive: true });

export function userClipDir(userId) {
  const dir = path.join(clipUploadsRootDir, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function generateClipFilename(ext) {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
}

export function publicUrlForClipFile(userId, filename) {
  const base = config.scheduler.publicUploadBaseUrl.replace(/\/$/, "");
  return `${base}/clips/${userId}/${filename}`;
}

export function absolutePathForClipFile(userId, filename) {
  return path.join(clipUploadsRootDir, userId, filename);
}

/** Resolves a stored public clip URL (as produced above) back to its absolute disk path. */
export function absolutePathFromClipUrl(url, userId) {
  const filename = String(url || "").split("/").pop();
  return absolutePathForClipFile(userId, filename);
}

/** Builds a fully-qualified, publicly reachable URL for Meta's servers to fetch (video_url/file_url). */
export function absoluteUrlForClipFile(relativeUrl) {
  const base = config.appUrl.replace(/\/$/, "");
  const rel = String(relativeUrl || "").replace(/^\//, "");
  return `${base}/${rel}`;
}
