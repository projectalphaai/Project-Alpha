/**
 * Sprint 7 — Modules 4+5: Real publish adapter + retry queue
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3000";
const results = [];
const log = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` | ${detail}` : ""}`);
};

let token = "";
async function req(pathName, opts = {}, useAuth = true) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + pathName, {
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
  return { res, json };
}

{
  const h = await req("/api/health", {}, false);
  log("Health sprint 7", h.res.ok && h.json?.sprint === 7);
  log(
    "Publish worker reports adapter",
    Boolean(h.json?.publishWorker?.adapter),
    `adapter=${h.json?.publishWorker?.adapter} mode=${h.json?.publishWorker?.publishAdapterMode}`
  );
}

{
  const s = await req(
    "/api/auth/signup",
    {
      method: "POST",
      body: {
        email: `s7m45_${Date.now()}@example.com`,
        password: "TestPass123!",
        name: "Sprint7 M45"
      }
    },
    false
  );
  token = s.json?.token || "";
  log("JWT signup", !!token);
}

{
  const future = new Date(Date.now() + 3600_000).toISOString();
  const noConn = await req("/api/posts", {
    method: "POST",
    body: {
      platform: "instagram",
      caption: "Should require connection",
      mediaUrl: "https://example.com/photo.jpg",
      scheduledAt: future,
      status: "scheduled"
    }
  });
  log(
    "Schedule IG without connection → 409",
    noConn.res.status === 409,
    noConn.json?.error
  );

  const noMedia = await req("/api/posts", {
    method: "POST",
    body: {
      platform: "instagram",
      caption: "Needs media",
      scheduledAt: future,
      status: "scheduled"
    }
  });
  // Without connection, 409 may fire first; either 400 media or 409 connect is acceptable gate
  log(
    "Schedule IG gated (connection or mediaUrl)",
    noMedia.res.status === 409 || noMedia.res.status === 400,
    `status=${noMedia.res.status}`
  );

  const draftOk = await req("/api/posts", {
    method: "POST",
    body: {
      platform: "instagram",
      caption: "Draft without connection ok",
      status: "draft"
    }
  });
  log("IG draft allowed without connection", draftOk.res.status === 201, draftOk.json?.error);
}

{
  const idx = fs.readFileSync(path.join(root, "server/src/lib/publishers/index.js"), "utf8");
  const live = fs.readFileSync(
    path.join(root, "server/src/lib/publishers/metaLivePublisher.js"),
    "utf8"
  );
  const worker = fs.readFileSync(path.join(root, "server/src/worker/publisherWorker.js"), "utf8");

  log(
    "Publisher adapter registry (mock|meta-live|auto)",
    idx.includes("meta-live") && idx.includes("resolvePublisherAdapter")
  );
  log(
    "Live publisher uses Graph + token refresh",
    live.includes("publishWithMetaLiveAdapter") &&
      live.includes("ensureFreshConnectionSecrets") &&
      live.includes("createInstagramMediaContainer") &&
      live.includes("publishFacebookPagePost")
  );
  log(
    "Worker auto-retries with backoff before final fail",
    worker.includes("retry_scheduled") &&
      worker.includes("backoffMs") &&
      worker.includes("attemptCount < maxAttempts")
  );
}

{
  process.env.PUBLISH_ADAPTER = "mock";
  const { resolvePublisherAdapter } = await import(
    pathToFileURL(path.join(root, "server/src/lib/publishers/index.js")).href
  );
  const mock = resolvePublisherAdapter();
  log("PUBLISH_ADAPTER=mock resolves mock", mock.name === "mock");

  process.env.PUBLISH_ADAPTER = "meta-live";
  const live = resolvePublisherAdapter();
  log("PUBLISH_ADAPTER=meta-live resolves meta-live", live.name === "meta-live");
}

const failed = results.filter((r) => !r.pass);
console.log("\n--- Sprint 7 Modules 4+5 Summary ---");
console.log(`PASS=${results.length - failed.length} FAIL=${failed.length} TOTAL=${results.length}`);
failed.forEach((f) => console.log("FAIL_ITEM:", f.name, "|", f.detail));
process.exit(failed.length ? 1 : 0);
