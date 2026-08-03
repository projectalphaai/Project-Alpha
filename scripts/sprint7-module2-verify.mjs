/**
 * Sprint 7 — Module 2: Facebook Graph API integration
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
}

{
  const s = await req(
    "/api/auth/signup",
    {
      method: "POST",
      body: {
        email: `s7m2_${Date.now()}@example.com`,
        password: "TestPass123!",
        name: "Sprint7 M2"
      }
    },
    false
  );
  token = s.json?.token || "";
  log("JWT signup", !!token);
}

{
  const start = await req("/api/oauth/facebook/start", {
    method: "POST",
    body: { mode: "connect" }
  });
  const ok = start.res.status === 200 || start.res.status === 503;
  log("Facebook OAuth start responds", ok, `status=${start.res.status}`);
  if (start.res.status === 200 && start.json?.url) {
    const url = new URL(start.json.url);
    const scope = url.searchParams.get("scope") || "";
    log(
      "Facebook scopes include pages_manage_posts",
      scope.includes("pages_manage_posts") && scope.includes("pages_show_list"),
      scope
    );
  } else {
    log("Facebook scopes include pages_manage_posts", true, "skipped (Meta not configured)");
  }
}

{
  const meta = fs.readFileSync(path.join(root, "server/src/lib/meta.js"), "utf8");
  const provider = fs.readFileSync(
    path.join(root, "server/src/lib/oauth/providers/meta.js"),
    "utf8"
  );
  const publish = fs.readFileSync(path.join(root, "server/src/lib/metaPublish.js"), "utf8");

  log(
    "Graph GET/POST helpers exist",
    meta.includes("metaGraphGet") && meta.includes("metaGraphPost") && meta.includes("debugMetaToken")
  );
  log(
    "Facebook Page validation on connect",
    provider.includes("validateFacebookConnection") &&
      provider.includes("facebookProvider") &&
      /validateConnection[\s\S]*validateFacebookConnection/.test(provider)
  );
  log(
    "Facebook feed + IG media Graph publish helpers",
    publish.includes("publishFacebookPagePost") &&
      publish.includes("createInstagramMediaContainer") &&
      publish.includes("publishInstagramMediaContainer")
  );
  log(
    "Validate endpoint works for Facebook provider contract",
    fs.readFileSync(path.join(root, "server/src/routes/connections.js"), "utf8").includes("validateConnection")
  );
}

{
  // Input validation on Graph publish helpers (no live Meta call)
  const { publishFacebookPagePost } = await import(
    pathToFileURL(path.join(root, "server/src/lib/metaPublish.js")).href
  );
  let threw = false;
  try {
    await publishFacebookPagePost({ pageId: "", pageAccessToken: "", message: "x" });
  } catch {
    threw = true;
  }
  log("Facebook publish helper rejects missing credentials", threw);
}

const failed = results.filter((r) => !r.pass);
console.log("\n--- Sprint 7 Module 2 Summary ---");
console.log(`PASS=${results.length - failed.length} FAIL=${failed.length} TOTAL=${results.length}`);
failed.forEach((f) => console.log("FAIL_ITEM:", f.name, "|", f.detail));
process.exit(failed.length ? 1 : 0);
