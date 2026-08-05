import { createOpenAIClient, getOpenAICostControls } from "../openai.js";
import { detectSceneChanges, computeAudioEnergyProfile } from "./ffmpeg.js";

/**
 * Sprint 12 — Viral Clip AI: moment detection.
 *
 * Combines two genuinely-computed signal sources:
 *  1. Real ffmpeg signals: scene cuts (frame-difference based) and audio-energy
 *     runs (RMS computed directly from decoded PCM) -> scene_change, high_energy_audio, pause.
 *  2. A transcript-grounded LLM pass: the model is only ever allowed to reference
 *     segment INDICES from the real Whisper transcript we hand it, so every
 *     hook/emotional/emphasis moment's timestamp comes straight from real Whisper
 *     data, never invented by the model.
 *
 * Every moment carries an honest, heuristic explanation string — nothing here is
 * presented as a trained classifier's confidence score.
 */

const MAX_SEGMENTS_PER_CALL = 50;

function mergeRuns(items, { minDurationSec = 0.5 } = {}) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const runs = [];
  let current = { start: sorted[0].start, end: sorted[0].end, maxRms: sorted[0].rms || 0 };
  for (let i = 1; i < sorted.length; i += 1) {
    const item = sorted[i];
    if (item.start - current.end < 0.001) {
      current.end = Math.max(current.end, item.end);
      if (item.rms !== undefined) current.maxRms = Math.max(current.maxRms, item.rms);
    } else {
      runs.push(current);
      current = { start: item.start, end: item.end, maxRms: item.rms || 0 };
    }
  }
  runs.push(current);
  return runs.filter((r) => r.end - r.start >= minDurationSec);
}

/** Real ffmpeg-derived signal moments: scene cuts, high-energy audio, and pauses. */
export async function detectSignalMoments(videoPath) {
  const moments = [];

  try {
    const sceneTimestamps = await detectSceneChanges(videoPath, { threshold: 0.4 });
    for (const t of sceneTimestamps) {
      moments.push({
        type: "scene_change",
        startSec: Math.max(0, Number((t - 0.5).toFixed(2))),
        endSec: Number((t + 1).toFixed(2)),
        score: 60,
        explanation: `Real visual scene cut detected via frame-difference analysis at ${t.toFixed(1)}s.`
      });
    }
  } catch (err) {
    console.warn("Scene-change detection failed:", err?.message || err);
  }

  try {
    const windows = await computeAudioEnergyProfile(videoPath, { windowSec: 1 });
    if (windows.length > 0) {
      const rmsValues = windows.map((w) => w.rms);
      const mean = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
      const variance = rmsValues.reduce((a, b) => a + (b - mean) ** 2, 0) / rmsValues.length;
      const std = Math.sqrt(variance);

      const highEnergyRuns = mergeRuns(
        windows
          .filter((w) => w.rms > mean + 1.25 * std)
          .map((w) => ({ start: w.startSec, end: w.endSec, rms: w.rms })),
        { minDurationSec: 0.75 }
      );
      for (const run of highEnergyRuns) {
        const z = std > 0 ? (run.maxRms - mean) / std : 0;
        moments.push({
          type: "high_energy_audio",
          startSec: run.start,
          endSec: run.end,
          score: Math.max(0, Math.min(95, Math.round(50 + z * 15))),
          explanation: `Audio energy spiked ~${z.toFixed(1)} standard deviations above this video's average loudness — a possible laughter/applause/reaction moment (heuristic signal from real waveform analysis, not a trained sound classifier).`
        });
      }

      const lowThreshold = Math.max(0.01, mean - std);
      const pauseRuns = mergeRuns(
        windows.filter((w) => w.rms < lowThreshold).map((w) => ({ start: w.startSec, end: w.endSec })),
        { minDurationSec: 1.2 }
      );
      for (const run of pauseRuns) {
        moments.push({
          type: "pause",
          startSec: run.start,
          endSec: run.end,
          score: 40,
          explanation: `Sustained quiet section (${(run.end - run.start).toFixed(1)}s) detected via real audio RMS analysis — often a natural cut point or dramatic pause.`
        });
      }
    }
  } catch (err) {
    console.warn("Audio energy analysis failed:", err?.message || err);
  }

  return moments;
}

const momentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["moments"],
  properties: {
    moments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "startIndex", "endIndex", "explanation", "score"],
        properties: {
          type: { type: "string", enum: ["hook", "emotional", "emphasis"] },
          startIndex: { type: "integer" },
          endIndex: { type: "integer" },
          explanation: { type: "string" },
          score: { type: "integer" }
        }
      }
    }
  }
};

/**
 * Transcript-grounded LLM pass. The model may only reference segment indices we
 * hand it in this window, so timestamps in the returned moments always come
 * from the real Whisper segments, never from the model's imagination.
 */
export async function detectTranscriptMoments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const controls = getOpenAICostControls();
  const allMoments = [];

  for (let offset = 0; offset < segments.length; offset += MAX_SEGMENTS_PER_CALL) {
    const window = segments.slice(offset, offset + MAX_SEGMENTS_PER_CALL);
    const transcriptBlock = window
      .map((seg, i) => `[${offset + i}] (${seg.start.toFixed(1)}s-${seg.end.toFixed(1)}s) ${seg.text}`)
      .join("\n");

    let client;
    try {
      client = createOpenAIClient();
    } catch {
      break; // OpenAI not configured — honest no-op rather than fabricating moments.
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), controls.timeoutMs);
    try {
      const response = await client.responses.create(
        {
          model: controls.model,
          instructions:
            "You are a viral short-form video editor analyzing a REAL transcript with real segment indices and timestamps. Identify only moments strongly grounded in the quoted text: 'hook' (an attention-grabbing opening line, bold claim, or question), 'emotional' (visible emotional weight in what's said), 'emphasis' (the speaker clearly stressing a key point). Reference ONLY the given segment indices for startIndex/endIndex — never invent timestamps. If nothing qualifies, return an empty moments array. Ground every explanation in the actual quoted words, and keep score (0-100) as your honest heuristic strength for how well this moment fits the type.",
          input: [{ role: "user", content: [{ type: "input_text", text: transcriptBlock }] }],
          text: {
            format: { type: "json_schema", name: "clip_moments", strict: true, schema: momentSchema }
          },
          max_output_tokens: controls.maxOutputTokens
        },
        { signal: controller.signal }
      );

      const raw = String(response.output_text || "{}");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { moments: [] };
      }

      for (const m of parsed.moments || []) {
        const startIdx = Math.max(offset, Math.min(segments.length - 1, Number(m.startIndex)));
        const endIdx = Math.max(startIdx, Math.min(segments.length - 1, Number(m.endIndex)));
        if (!segments[startIdx] || !segments[endIdx]) continue;
        allMoments.push({
          type: m.type,
          startSec: segments[startIdx].start,
          endSec: segments[endIdx].end,
          score: Math.max(0, Math.min(100, Number(m.score) || 50)),
          explanation: String(m.explanation || "").slice(0, 300)
        });
      }
    } catch (err) {
      // Honest partial failure: skip this window rather than fabricate moments for it.
      console.warn("Transcript moment detection window failed:", err?.message || err);
    } finally {
      clearTimeout(timer);
    }
  }

  return allMoments;
}

/** Full pipeline: real ffmpeg signals + transcript-grounded LLM moments, merged and sorted. */
export async function detectMoments({ videoPath, transcriptSegments }) {
  const [signalMoments, transcriptMoments] = await Promise.all([
    detectSignalMoments(videoPath),
    detectTranscriptMoments(transcriptSegments)
  ]);
  const merged = [...signalMoments, ...transcriptMoments].sort((a, b) => a.startSec - b.startSec);
  return merged.slice(0, 60);
}
