import { createOpenAIClient, getOpenAICostControls } from "./openai.js";

// Sprint 11 — AI Content Box. Additive: reuses createOpenAIClient() /
// getOpenAICostControls() from openai.js but does not modify the existing
// generateSocialContent()/`/api/ai/generate-content` code path at all.
const contentBoxSchema = {
  type: "object",
  additionalProperties: false,
  required: ["caption", "hashtags", "cta", "emojiVersion", "professionalVersion", "casualVersion"],
  properties: {
    caption: { type: "string" },
    hashtags: { type: "string" },
    cta: { type: "string" },
    emojiVersion: { type: "string" },
    professionalVersion: { type: "string" },
    casualVersion: { type: "string" }
  }
};

export async function generateContentVariants({ platform, prompt }) {
  const client = createOpenAIClient();
  const controls = getOpenAICostControls();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), controls.timeoutMs);

  try {
    const response = await client.responses.create(
      {
        model: controls.model,
        instructions:
          "You are Project Alpha's AI Content Box for a social media scheduler. From one prompt, produce a ready-to-publish caption, 6-10 space-separated hashtags, and a short call to action, plus three tone variants of the caption: emoji-forward, professional, and casual. Return only JSON matching the schema.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Platform: ${platform}\nPrompt: ${prompt}`
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "content_box",
            strict: true,
            schema: contentBoxSchema
          }
        },
        max_output_tokens: controls.maxOutputTokens
      },
      { signal: controller.signal }
    );

    const raw = String(response.output_text || "").trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const err = new Error("AI returned an unreadable response. Please try again.");
      err.status = 502;
      throw err;
    }

    const result = {
      caption: String(parsed.caption || "").trim(),
      hashtags: String(parsed.hashtags || "").trim(),
      cta: String(parsed.cta || "").trim(),
      emojiVersion: String(parsed.emojiVersion || "").trim(),
      professionalVersion: String(parsed.professionalVersion || "").trim(),
      casualVersion: String(parsed.casualVersion || "").trim()
    };

    if (!result.caption || !result.hashtags) {
      const err = new Error("AI response was incomplete. Please try again.");
      err.status = 502;
      throw err;
    }

    return { ...result, platform, generatedAt: new Date().toISOString() };
  } catch (err) {
    if (err?.name === "AbortError" || err?.code === "ETIMEDOUT") {
      const timeoutErr = new Error("AI request timed out. Please try again.");
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    if (err?.status === 503 || err?.status === 502 || err?.status === 504) {
      throw err;
    }
    if (err?.status === 401 || err?.code === "invalid_api_key") {
      const keyErr = new Error("AI service configuration error. Contact support.");
      keyErr.status = 503;
      throw keyErr;
    }
    if (err?.status === 429) {
      const rateErr = new Error("AI provider rate limit reached. Please wait and try again.");
      rateErr.status = 429;
      throw rateErr;
    }
    const safe = new Error("AI content generation failed. Please try again.");
    safe.status = 502;
    throw safe;
  } finally {
    clearTimeout(timer);
  }
}
