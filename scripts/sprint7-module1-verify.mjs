/**
 * Sprint 7 — Module 1: Real Instagram OAuth connection
 * Architectural + API contract verification (live Meta redirect requires META_* credentials).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3000";
const results = [];

const log = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` | ${detail}` : ""}`);
};

let token = "";
const email = `s7m1_${Date.now()}@example.com`;

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
  return { res, json, text };
}

{
  const h = await req("/api/health", {}, false);
  log("Health sprint 7", h.res.ok && h.json?.sprint === 7, `sprint=${h.json?.sprint}`);
  log(
    "Instagram provider listed",
    Array.isArray(h.json?.oauthProviders) &&
      h.json.oauthProviders.some((p) => p.id === "instagram"),
    `configured=${h.json?.oauth?.instagram}`
  );
}

{
  const s = await req(
    "/api/auth/signup",
    { method: "POST", body: { email, password: "TestPass123!", name: "Sprint7 M1" } },
    false
  );
  token = s.json?.token || "";
  log("JWT signup", !!token);
}

{
  const unauth = await req("/api/oauth/instagram/start", { method: "POST", body: {} }, false);
  log("JWT protects Instagram OAuth start", unauth.res.status === 401);
}

{
  const start = await req("/api/oauth/instagram/start", {
    method: "POST",
    body: { mode: "connect" }
  });
  const configured = start.res.status === 200 && start.json?.url;
  const notConfigured = start.res.status === 503 && start.json?.configured === false;
  log(
    "Instagram OAuth start (configured URL or honest 503)",
    configured || notConfigured,
    configured
      ? `urlHost=${(() => {
          try {
            return new URL(start.json.url).host;
          } catch {
            return "bad-url";
          }
        })()}`
      : `status=${start.res.status}`
  );

  if (configured) {
    const url = new URL(start.json.url);
    log(
      "Authorize URL is Facebook Login dialog",
      url.hostname.includes("facebook.com") && url.pathname.includes("dialog/oauth"),
      url.pathname
    );
    const scope = url.searchParams.get("scope") || "";
    log(
      "Instagram scopes include publish + pages",
      scope.includes("instagram_basic") &&
        scope.includes("instagram_content_publish") &&
        scope.includes("pages_show_list"),
      scope
    );
    log(
      "IG_API_ONBOARDING extras present",
      (url.searchParams.get("extras") || "").includes("IG_API_ONBOARDING")
    );
    log("OAuth state param present", Boolean(url.searchParams.get("state")));
  }
}

{
  const providers = await req("/api/oauth/providers");
  const ig = (providers.json?.providers || []).find((p) => p.id === "instagram");
  log("Providers API exposes Instagram", providers.res.ok && !!ig, JSON.stringify(ig));
}

{
  const connections = await req("/api/connections");
  log(
    "Connections API returns Instagram slot",
    connections.res.ok && connections.json?.connections?.instagram,
    `configured=${connections.json?.connections?.instagram?.configured}`
  );
}

{
  const badValidate = await req("/api/connections/does-not-exist/validate", { method: "POST" });
  log("Validate unknown connection → 404", badValidate.res.status === 404);
}

{
  const metaJs = fs.readFileSync(path.join(root, "server/src/lib/meta.js"), "utf8");
  const providerJs = fs.readFileSync(
    path.join(root, "server/src/lib/oauth/providers/meta.js"),
    "utf8"
  );
  const oauthJs = fs.readFileSync(path.join(root, "server/src/routes/oauth.js"), "utf8");
  const connJs = fs.readFileSync(path.join(root, "server/src/routes/connections.js"), "utf8");
  const dashJs = fs.readFileSync(path.join(root, "js/dashboard.js"), "utf8");

  log(
    "Post-connect IG Graph validation implemented",
    metaJs.includes("fetchInstagramAccount") &&
      metaJs.includes("validateInstagramConnection") &&
      metaJs.includes("debugMetaToken") &&
      providerJs.includes("fetchInstagramAccount") &&
      providerJs.includes("validateConnection")
  );
  log(
    "Reconnect targets specific accountId",
    oauthJs.includes("targetAccountId") && oauthJs.includes("reconnectMeta.accountId")
  );
  log("Validate endpoint wired", connJs.includes('"/:id/validate"'));
  log(
    "Dashboard sends accountId on reconnect + validate UI",
    dashJs.includes("data-account-id") && dashJs.includes("/validate")
  );
  log(
    "No fake Instagram connect bypass",
    !providerJs.includes("simulate") && !oauthJs.includes("fakeConnect")
  );
}

const failed = results.filter((r) => !r.pass);
console.log("\n--- Sprint 7 Module 1 Summary ---");
console.log(`PASS=${results.length - failed.length} FAIL=${failed.length} TOTAL=${results.length}`);
failed.forEach((f) => console.log("FAIL_ITEM:", f.name, "|", f.detail));

const metaConfigured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
if (!metaConfigured) {
  console.log(
    "\nNOTE: META_APP_ID/SECRET not set — live Facebook dialog + Graph exchange not exercised in this run."
  );
}

process.exit(failed.length ? 1 : 0);
