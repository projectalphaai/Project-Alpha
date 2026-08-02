import "dotenv/config";
import fs from "fs";
import { execSync } from "child_process";

const BASE = "http://127.0.0.1:3000";
const results = [];
const log = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` | ${detail}` : ""}`);
};

let token = "";
const email = `s5_${Date.now()}@example.com`;

async function req(path, opts = {}, useAuth = true) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
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

{
  const h = await req("/api/health", {}, false);
  log(
    "Health sprint 5 + oauth providers",
    h.res.ok && h.json?.sprint === 5 && Array.isArray(h.json?.oauthProviders) && h.json.oauthProviders.length === 5,
    `sprint=${h.json?.sprint} providers=${h.json?.oauthProviders?.length}`
  );
  log(
    "No secrets in health",
    !/sk-[A-Za-z0-9]{20,}/.test(h.text) && !h.text.includes(process.env.JWT_SECRET || "___")
  );
}

{
  const s = await req(
    "/api/auth/signup",
    { method: "POST", body: { email, password: "TestPass123!", name: "Sprint5" } },
    false
  );
  token = s.json?.token || "";
  log("Signup + JWT", !!token && s.json?.user?.role === "owner", `role=${s.json?.user?.role}`);
}

{
  const u = await req("/api/oauth/instagram/start", { method: "POST", body: {} }, false);
  log("JWT protects OAuth start", u.res.status === 401);
  const c = await req("/api/connections", {}, false);
  log("JWT protects connections", c.res.status === 401);
}

{
  const providers = await req("/api/oauth/providers");
  const ids = (providers.json?.providers || []).map((p) => p.id).sort().join(",");
  log(
    "Provider registry",
    providers.res.ok && ids === "facebook,instagram,linkedin,x,youtube",
    ids
  );
}

const platforms = ["instagram", "facebook", "youtube", "linkedin", "x"];
for (const platform of platforms) {
  const start = await req(`/api/oauth/${platform}/start`, { method: "POST", body: { mode: "connect" } });
  // Either redirect URL (configured) or 503 placeholder (not configured) — never fake connect
  const ok =
    (start.res.ok && typeof start.json?.url === "string" && start.json.url.startsWith("http")) ||
    (start.res.status === 503 && /not configured/i.test(start.json?.error || ""));
  log(`OAuth start architecture (${platform})`, ok, `${start.res.status} ${start.json?.error || "url"}`);
}

{
  const list = await req("/api/connections");
  const conns = list.json?.connections || {};
  const allSupported = platforms.every((p) => conns[p]?.supported === true);
  const accountsArray = Array.isArray(list.json?.accounts);
  log(
    "Connections multi-account API",
    list.res.ok && allSupported && accountsArray,
    `connectedCount=${list.json?.connectedCount}`
  );
  log(
    "Expiry/reconnect fields present",
    platforms.every((p) => "reconnectRequired" in (conns[p] || {}) && "configured" in (conns[p] || {}))
  );
}

{
  // Persistence: encrypted upsert path exercised via schema + disconnect empty
  const del = await req("/api/connections/instagram", { method: "DELETE" });
  log("Disconnect platform endpoint", del.res.ok, `deleted=${del.json?.deleted}`);
}

{
  const missing = await req("/api/connections/account/does-not-exist/refresh", { method: "POST" });
  // wrong path — refresh is /:id/refresh
  const missing2 = await req("/api/connections/does-not-exist/refresh", { method: "POST" });
  log("Refresh unknown connection 404", missing2.res.status === 404);
  const recon = await req("/api/connections/does-not-exist/reconnect", { method: "POST" });
  log("Reconnect unknown connection 404", recon.res.status === 404);
}

{
  const act = await req("/api/activity?limit=20");
  const types = new Set((act.json?.activity || []).map((a) => a.type));
  log(
    "OAuth audit logging",
    act.res.ok && (types.has("oauth_start") || types.has("oauth_disconnect")),
    [...types].join(",")
  );
}

{
  const html = fs.readFileSync("pages/dashboard.html", "utf8");
  const js = fs.readFileSync("js/dashboard.js", "utf8");
  log(
    "Dashboard all platforms wired",
    !html.includes("unavailable in Sprint 1") &&
      /\/api\/oauth\/\$\{platform\}\/start/.test(js)
  );
  log(
    "Dashboard reconnect + multi-account UI",
    js.includes("startOAuthFlow") &&
      js.includes("renderConnectedAccountsList") &&
      html.includes("connected-accounts-list") &&
      html.includes("reconnect-btn")
  );
  log("No simulate-auth copy", !html.includes("Simulate authorization"));
}

{
  const tracked = execSync("git ls-files .env", { encoding: "utf8" }).trim();
  const example = fs.readFileSync(".env.example", "utf8");
  log(
    "Env placeholders present",
    example.includes("GOOGLE_CLIENT_ID=") &&
      example.includes("LINKEDIN_CLIENT_ID=") &&
      example.includes("X_CLIENT_ID=") &&
      example.includes("META_APP_ID=")
  );
  log("No .env tracked", !tracked);
}

{
  const rbac = fs.readFileSync("server/src/middleware/rbac.js", "utf8");
  const oauth = fs.readFileSync("server/src/routes/oauth.js", "utf8");
  const token = fs.readFileSync("server/src/lib/oauth/tokenService.js", "utf8");
  log(
    "RBAC + encrypted token service",
    rbac.includes("requireRole") &&
      oauth.includes("requireRole") &&
      token.includes("encryptSecret") &&
      token.includes("refreshConnectionTokens")
  );
}

const failed = results.filter((r) => !r.pass);
console.log("\n--- Summary ---");
console.log(`PASS=${results.length - failed.length} FAIL=${failed.length} TOTAL=${results.length}`);
failed.forEach((f) => console.log("FAIL_ITEM:", f.name, "|", f.detail));
process.exit(failed.length ? 1 : 0);
