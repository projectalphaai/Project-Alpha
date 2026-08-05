import fs from "fs";
import crypto from "crypto";
import { createOpenAIClient } from "../openai.js";
import { config } from "../../config.js";
import { probeImageDimensions } from "./probe.js";
import { userUploadDirFor, publicUrlForUpload, absolutePathForUpload } from "./upload.js";

/**
 * Real OpenAI image generation (existing OPENAI_API_KEY, additive — does not
 * touch server/src/lib/openai.js's existing text-generation code path).
 * Saves the result to disk under the user's upload folder so it behaves
 * exactly like an uploaded asset (stable local URL, real dimension probe).
 */
export async function generateAIImage({ userId, prompt }) {
  const client = createOpenAIClient();

  let response;
  try {
    response = await client.images.generate({
      model: config.openai.imageModel,
      prompt,
      size: "1024x1024",
      n: 1
    });
  } catch (err) {
    if (err?.status === 401) {
      const e = new Error("AI image generation configuration error. Contact support.");
      e.status = 503;
      throw e;
    }
    if (err?.status === 429) {
      const e = new Error("AI image provider rate limit reached. Please wait and try again.");
      e.status = 429;
      throw e;
    }
    const e = new Error("AI image generation failed. Please try again.");
    e.status = 502;
    throw e;
  }

  const b64 = response?.data?.[0]?.b64_json;
  const remoteUrl = response?.data?.[0]?.url;
  if (!b64 && !remoteUrl) {
    const e = new Error("AI image provider returned an empty response.");
    e.status = 502;
    throw e;
  }

  userUploadDirFor(userId);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.png`;
  const filePath = absolutePathForUpload(userId, filename);

  if (b64) {
    fs.writeFileSync(filePath, Buffer.from(b64, "base64"));
  } else {
    const fetched = await fetch(remoteUrl);
    const arrayBuffer = await fetched.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
  }

  const { width, height } = probeImageDimensions(filePath);

  return {
    url: publicUrlForUpload(userId, filename),
    width,
    height,
    mimeType: "image/png"
  };
}
