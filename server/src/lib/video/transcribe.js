import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { extractAudio, segmentAudio } from "./ffmpeg.js";
import { transcribeAudioFile } from "../openai.js";

// Real OpenAI Whisper request-size limit is 25MB. At ~64kbps mono mp3 that's
// roughly 50+ minutes of audio, but we chunk conservatively so long-form
// source videos (up to CLIP_MAX_SOURCE_DURATION_MIN) always stay well under it.
const CHUNK_TARGET_SEC = 600; // 10 minutes per chunk

/**
 * Sprint 12 — Viral Clip AI: real chunked Whisper transcription for long-form video.
 * Extracts a low-bitrate mono audio track, splits it into sequential real ffmpeg
 * segments, transcribes each chunk with the real Whisper API, then merges the
 * segment-level timestamps with a time offset so the final transcript's timestamps
 * are accurate against the original, full-length source video.
 */
export async function transcribeVideo(videoPath, { language } = {}) {
  const workDir = path.join(os.tmpdir(), `pa-clip-transcribe-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(workDir, { recursive: true });
  const audioPath = path.join(workDir, "audio.mp3");

  try {
    await extractAudio(videoPath, audioPath, { bitrateKbps: 64 });

    const chunks = await segmentAudio(audioPath, path.join(workDir, "chunks"), {
      targetSec: CHUNK_TARGET_SEC
    });
    const targets = chunks.length > 0 ? chunks : [{ path: audioPath, offsetSec: 0 }];

    let mergedText = "";
    const mergedSegments = [];
    let detectedLanguage = language || "";
    const chunkErrors = [];

    for (const chunk of targets) {
      try {
        const result = await transcribeAudioFile(chunk.path, { language });
        if (!detectedLanguage) detectedLanguage = result.language;
        mergedText = mergedText ? `${mergedText} ${result.text}` : result.text;
        for (const seg of result.segments) {
          mergedSegments.push({
            start: Number((seg.start + chunk.offsetSec).toFixed(2)),
            end: Number((seg.end + chunk.offsetSec).toFixed(2)),
            text: seg.text
          });
        }
      } catch (err) {
        // Preserve partial progress + surface an honest per-chunk failure rather
        // than silently fabricating a transcript for the failed portion.
        chunkErrors.push({
          offsetSec: chunk.offsetSec,
          message: err?.message || String(err),
          status: err?.status || 502
        });
      }
    }

    if (mergedSegments.length === 0 && chunkErrors.length > 0) {
      const e = new Error(chunkErrors[0].message || "Transcription failed for all audio chunks.");
      e.status = chunkErrors[0].status || 502;
      throw e;
    }

    return {
      language: detectedLanguage,
      text: mergedText.trim(),
      segments: mergedSegments,
      partial: chunkErrors.length > 0,
      chunkErrors
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
