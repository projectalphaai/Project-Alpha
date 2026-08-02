import "dotenv/config";
import fs from "fs";

const BASE = "http://127.0.0.1:3000";
const results = [];
let authToken = "";
const email = `sprint3_${Date.now()}@example.com`;
const password = "TestPass123!";

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` | ${detail}` : ""}`);
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (authToken && !headers.Authorization) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { res, text, json };
}

function leaksSecret(payload) {
  const key = process.env.OPENAI_API_KEY || "";
  const s = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (key && s.includes(key)) return true;
  if (/sk-[A-Za-z0-9_-]{10,}/.test(s)) return true;
  if (/OPENAI_API_KEY\s*[:=]\s*['"]?sk-/.test(s)) return true;
  return false;
}

{
  const { res, json, text } = await req("/api/health");
  record(
    "Health sprint 3",
    res.ok && json?.sprint === 3 && json?.openaiConfigured === false,
    `openaiConfigured=${json?.openaiConfigured}`
  );
  record("No secret in health", !leaksSecret(text) && !("apiKey" in (json || {})));
}

{
  const { res, json } = await req("/api/auth/signup", {
    method: "POST",
    body: { email, password, name: "Sprint3 Tester" }
  });
  authToken = json?.token || "";
  record(
    "Signup for JWT tests",
    (res.ok || res.status === 201) && !!authToken,
    authToken ? email : json?.error || "no token"
  );
}

{
  const prev = authToken;
  authToken = "";
  const { res, json, text } = await req("/api/ai/generate-content", {
    method: "POST",
    body: {
      platform: "instagram",
      contentGoal: "awareness",
      tone: "friendly",
      topic: "AI scheduling tips"
    }
  });
  record("Unauthorized request", res.status === 401, `status=${res.status} error=${json?.error}`);
  record("No secret in unauthorized response", !leaksSecret(text));
  authToken = prev;
}

{
  const { res, json, text } = await req("/api/ai/generate-content", {
    method: "POST",
    body: { platform: "myspace", contentGoal: "awareness", tone: "friendly", topic: "ab" }
  });
  record("Invalid input", res.status === 400, json?.error);
  record("No secret in invalid input response", !leaksSecret(text));
}

{
  const { res, json, text } = await req("/api/ai/generate-content", {
    method: "POST",
    body: {
      platform: "instagram",
      contentGoal: "awareness",
      tone: "friendly",
      topic: "AI content scheduling for agencies",
      audience: "founders",
      language: "en"
    }
  });
  const ok = res.status === 503 && /OPENAI_API_KEY|unavailable|configuration/i.test(json?.error || "");
  record("OpenAI key missing", ok, `status=${res.status} error=${json?.error}`);
  record(
    "No raw OpenAI/secret leakage on missing key",
    !leaksSecret(text) && !/stack|api[_-]?key\s*[:=]/i.test(text)
  );
}

{
  if (!(process.env.OPENAI_API_KEY || "").trim()) {
    record("Successful generation", false, "FAIL: OPENAI_API_KEY not set in .env");
  } else {
    const { res, json, text } = await req("/api/ai/generate-content", {
      method: "POST",
      body: {
        platform: "instagram",
        contentGoal: "awareness",
        tone: "friendly",
        topic: "AI content scheduling for agencies",
        audience: "founders",
        language: "en"
      }
    });
    const shape =
      json?.caption &&
      json?.hashtags &&
      json?.shortHook &&
      json?.callToAction &&
      json?.platform &&
      json?.generatedAt;
    record(
      "Successful generation",
      res.ok && shape,
      res.ok ? "structured JSON ok" : `${res.status} ${json?.error}`
    );
    record("No secret in success response", !leaksSecret(text));
  }
}

const draftBody = {
  platform: "instagram",
  contentGoal: "awareness",
  tone: "friendly",
  topic: "AI content scheduling for agencies",
  audience: "founders",
  language: "en",
  caption: "Ship smarter social content with Project Alpha.",
  hashtags: "#AI #SocialMedia #ProjectAlpha #Agencies #Content",
  shortHook: "Stop guessing your captions.",
  callToAction: "Try Project Alpha today.",
  generatedAt: new Date().toISOString()
};

let draftId = null;
{
  const { res, json, text } = await req("/api/ai/drafts", { method: "POST", body: draftBody });
  draftId = json?.draft?.id || null;
  record("Save draft", res.status === 201 && !!draftId, draftId || json?.error);
  record("No secret in save draft response", !leaksSecret(text));
}

{
  const { res, json, text } = await req("/api/ai/drafts");
  const found = (json?.drafts || []).some((d) => d.id === draftId);
  record("List drafts", res.ok && found, `count=${json?.drafts?.length}`);
  record("No secret in list drafts response", !leaksSecret(text));
}

{
  const { res, json, text } = await req(`/api/ai/drafts/${draftId}`, { method: "DELETE" });
  const list = await req("/api/ai/drafts");
  const gone = !(list.json?.drafts || []).some((d) => d.id === draftId);
  record("Delete draft", res.ok && gone, json?.error || "deleted");
  record("No secret in delete draft response", !leaksSecret(text));
}

{
  const dash = fs.readFileSync("js/dashboard.js", "utf8");
  const html = fs.readFileSync("pages/dashboard.html", "utf8");
  const flow =
    dash.includes("/api/ai/generate-content") &&
    dash.includes("contentGoal") &&
    dash.includes("ai-copy-caption-btn") &&
    dash.includes("ai-copy-hashtags-btn") &&
    dash.includes("ai-form-error") &&
    dash.includes("data-delete-draft") &&
    html.includes("ai-audience") &&
    html.includes("ai-language") &&
    html.includes("Copy caption") &&
    html.includes("Copy hashtags");
  record("Frontend generation flow wiring", flow);
}

{
  const openaiLib = fs.readFileSync("server/src/lib/openai.js", "utf8");
  const envExample = fs.readFileSync(".env.example", "utf8");
  record("Uses Responses API", openaiLib.includes("responses.create"));
  record(
    "Cost controls present",
    openaiLib.includes("max_output_tokens") &&
      envExample.includes("OPENAI_TIMEOUT_MS") &&
      envExample.includes("OPENAI_MAX_OUTPUT_TOKENS") &&
      envExample.includes("AI_RATE_LIMIT") &&
      envExample.includes("OPENAI_API_KEY=")
  );
}

console.log("\n--- Summary ---");
const failed = results.filter((r) => !r.pass);
console.log(`Total: ${results.length} | PASS: ${results.length - failed.length} | FAIL: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
