/**
 * Sprint 8 — first paying customer readiness verify
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

async function waitForApi() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return res.json();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("API not ready");
}

const health = await waitForApi();
log("Health sprint 8", health.sprint === 8, `sprint=${health.sprint}`);
log(
  "Publish worker productionSafe flag present",
  typeof health.publishWorker?.productionSafe === "boolean",
  JSON.stringify(health.publishWorker)
);

let token = "";
{
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `s8_${Date.now()}@example.com`,
      password: "TestPass123!",
      name: "Sprint8"
    })
  });
  const json = await res.json();
  token = json.token || "";
  log("JWT signup", !!token);
}

async function api(pathName, opts = {}) {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (opts.body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + pathName, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

{
  const h = await api("/api/connections/health");
  log("Connection health endpoint", h.res.ok && h.json?.summary, JSON.stringify(h.json?.summary));
}

{
  const hist = await api("/api/posts/history");
  log("Publish history endpoint", hist.res.ok && Array.isArray(hist.json?.history));
}

{
  const f = await api("/api/posts/founder-stats");
  log(
    "Founder stats endpoint",
    f.res.ok &&
      typeof f.json?.stats?.connectedAccounts === "number" &&
      typeof f.json?.stats?.activeConnections === "number" &&
      typeof f.json?.stats?.publishedPosts === "number" &&
      typeof f.json?.stats?.failedPosts === "number" &&
      typeof f.json?.stats?.scheduledPosts === "number",
    JSON.stringify(f.json?.stats)
  );
}

{
  const future = new Date(Date.now() + 3600_000).toISOString();
  const blocked = await api("/api/posts", {
    method: "POST",
    body: {
      platform: "instagram",
      caption: "Sprint 8 schedule gate check",
      mediaUrl: "https://example.com/a.jpg",
      scheduledAt: future,
      status: "scheduled"
    }
  });
  log("IG schedule still requires connection", blocked.res.status === 409);
}

{
  const { getPublisherAdapterInfo } = await import(
    pathToFileURL(path.join(root, "server/src/lib/publishers/index.js")).href
  );
  const info = getPublisherAdapterInfo();
  log("Adapter info helper works", typeof info.ok === "boolean", JSON.stringify(info));

  const fe = await import(
    pathToFileURL(path.join(root, "server/src/lib/friendlyErrors.js")).href
  );
  const mapped = fe.friendlyPublishError("OAuthException: (#10) permission", {
    platform: "instagram"
  });
  log("Friendly permission error", mapped.code === "PERMISSIONS", mapped.message);
}

{
  const html = fs.readFileSync(path.join(root, "pages/dashboard.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "js/dashboard.js"), "utf8");
  log(
    "Founder Dashboard UI",
    html.includes("founder-dashboard") &&
      html.includes("stat-active-connections") &&
      js.includes("renderFounderDashboard") &&
      js.includes("/api/connections/health")
  );
  log(
    "Publish history UI",
    html.includes("scheduler-history-view") && js.includes("renderPublishHistory")
  );
  log(
    "Checklists present",
    fs.existsSync(path.join(root, "PRODUCTION_READINESS.md")) &&
      fs.existsSync(path.join(root, "BETA_LAUNCH.md"))
  );
  log("No Mock publisher overview label", !js.includes('"Mock publisher"'));
}

const failed = results.filter((r) => !r.pass);
console.log("\n--- Sprint 8 Summary ---");
console.log(`PASS=${results.length - failed.length} FAIL=${failed.length} TOTAL=${results.length}`);
failed.forEach((f) => console.log("FAIL_ITEM:", f.name, "|", f.detail));
process.exitCode = failed.length ? 1 : 0;
