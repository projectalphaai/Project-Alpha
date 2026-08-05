import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";
import { config } from "../../config.js";
import { guessMediaType } from "./probe.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/lib/media -> project root (4 levels up), so files land under
// <root>/uploads and are served by the existing express.static(rootDir) in
// app.js — no extra static mount needed.
const rootDir = path.resolve(__dirname, "../../../..");
export const uploadsRootDir = path.join(rootDir, config.scheduler.uploadDir);

fs.mkdirSync(uploadsRootDir, { recursive: true });

export function userUploadDirFor(userId) {
  const dir = path.join(uploadsRootDir, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    cb(null, userUploadDirFor(req.user.id));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  const type = guessMediaType(file.mimetype, file.originalname);
  if (type === "unknown") {
    cb(new Error("Unsupported file type. Upload an image or video."));
    return;
  }
  cb(null, true);
}

export const uploadMedia = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.scheduler.maxUploadSizeMb * 1024 * 1024, files: 10 }
});

export function publicUrlForUpload(userId, filename) {
  const base = config.scheduler.publicUploadBaseUrl.replace(/\/$/, "");
  return `${base}/${userId}/${filename}`;
}

export function absolutePathForUpload(userId, filename) {
  return path.join(uploadsRootDir, userId, filename);
}
