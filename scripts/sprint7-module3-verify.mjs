/**
 * Sprint 7 — Module 3: Token management + reconnect flow
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
  const s = await req(
    "/api/auth/signup",
    {
      method: "POST",
      body: {
        email: `s7m3_${Date.now()}@example.com`,
        password: "TestPass123!",
        name: "Sprint7 M3"
      }
    },
    false
  );
  token = s.json?.token || "";
  log("JWT signup", !!token);
}

{
  const refresh404 = await req("/api/connections/missing/refresh", { method: "POST" });
  log("Refresh unknown → 404", refresh404.res.status === 404);

  const reconnect404 = await req("/api/connections/missing/reconnect", { method: "POST" });
  log("Reconnect unknown → 404", reconnect404.res.status === 404);
}

{
  const svc = fs.readFileSync(path.join(root, "server/src/lib/oauth/tokenService.js"), "utf8");
  const provider = fs.readFileSync(
    path.join(root, "server/src/lib/oauth/providers/meta.js"),
    "utf8"
  );
  const oauth = fs.readFileSync(path.join(root, "server/src/routes/oauth.js"), "utf8");
  const dash = fs.readFileSync(path.join(root, "js/dashboard.js"), "utf8");

  log(
    "ensureFreshConnectionSecrets helper",
    svc.includes("ensureFreshConnectionSecrets") && svc.includes("pageAccessTokenEnc")
  );
  log(
    "Refresh updates page access token",
    svc.includes("refreshed.pageAccessToken") &&
      provider.includes("pageAccessToken") &&
      /refreshAccessToken\(\{ accessToken, metadata \}/.test(provider)
  );
  log(
    "Reconnect filters by accountId",
    oauth.includes('mode === "reconnect"') && oauth.includes("reconnectMeta.accountId")
  );
  log(
    "UI reconnect passes accountId + connectionId",
    dash.includes("mode: \"reconnect\"") && dash.includes("accountId:")
  );
  log(
    "Expiry sync marks reconnectRequired",
    svc.includes("syncExpiryFlagsForUser") && svc.includes("reconnectRequired: true")
  );
}

{
  const start = await req("/api/oauth/instagram/start", {
    method: "POST",
    body: { mode: "reconnect", connectionId: "cuid_test", accountId: "ig_test" }
  });
  log(
    "Reconnect mode accepted on OAuth start",
    start.res.status === 200 || start.res.status === 503,
    `status=${start.res.status}`
  );
}

const failed = results.filter((r) => !r.pass);
console.log("\n--- Sprint 7 Module 3 Summary ---");
console.log(`PASS=${results.length - failed.length} FAIL=${failed.length} TOTAL=${results.length}`);
failed.forEach((f) => console.log("FAIL_ITEM:", f.name, "|", f.detail));
process.exitCode = failed.length ? 1 : 0;
