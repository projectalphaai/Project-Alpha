/**
 * Project Alpha — Sprint 1 smoke checks
 */
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const base = process.env.SMOKE_BASE || "http://127.0.0.1:3000";
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error("FAIL:", msg);
}

function ok(msg) {
  console.log("OK:", msg);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function httpGet(urlPath, redirects = 0) {
  return new Promise((resolve) => {
    const req = http.get(base + urlPath, { timeout: 5000 }, async (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        const loc = res.headers.location;
        const next = loc.startsWith("http") ? new URL(loc).pathname + (new URL(loc).search || "") : loc;
        resolve(await httpGet(next, redirects + 1));
        return;
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", (err) => resolve({ status: 0, body: "", error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: "", error: "timeout" });
    });
  });
}

const jsFiles = walk(root).filter(
  (f) => f.endsWith(".js") && !f.includes(`${path.sep}vendor${path.sep}`) && !f.includes(`${path.sep}node_modules${path.sep}`)
);
for (const file of jsFiles) {
  try {
    execSync(`node --check "${file}"`, { stdio: "pipe" });
    ok(`syntax ${path.relative(root, file)}`);
  } catch {
    fail(`syntax ${path.relative(root, file)}`);
  }
}

const critical = [
  "/",
  "/index.html",
  "/pages/login.html",
  "/pages/signup.html",
  "/pages/dashboard.html",
  "/css/style.css",
  "/css/auth.css",
  "/css/dashboard.css",
  "/js/script.js",
  "/js/config.js",
  "/js/api.js",
  "/js/auth.js",
  "/js/auth-pages.js",
  "/js/dashboard.js",
  "/api/health"
];

for (const p of critical) {
  const res = await httpGet(p);
  if (res.status === 200) ok(`HTTP 200 ${p}`);
  else fail(`HTTP ${res.status} ${p}${res.error ? ` (${res.error})` : ""}`);
}

const auth = fs.readFileSync(path.join(root, "js/auth.js"), "utf8");
if (!auth.includes("/api/auth/login") || auth.includes("localStorage")) {
  fail("auth.js must use API sessions, not localStorage mocks");
} else ok("auth uses real API sessions");

const dash = fs.readFileSync(path.join(root, "js/dashboard.js"), "utf8");
if (
  !dash.includes("/api/oauth/") ||
  !dash.includes("/api/ai/generate-content") ||
  !dash.includes("/api/posts") ||
  !dash.includes("/api/activity") ||
  !dash.includes("/api/leads") ||
  !dash.includes("renderCrmBoard") ||
  !dash.includes("/cancel") ||
  !dash.includes("/retry") ||
  !dash.includes("startOAuthFlow")
) {
  fail("dashboard.js missing Sprint 5/6 OAuth / scheduler / CRM wiring");
} else ok("dashboard wired to OAuth, AI, posts, activity, CRM leads");

if (dash.includes("seedPhase1DemoData") || dash.includes("pa_phase1_seeded")) {
  fail("mock seed data still present in dashboard.js");
} else ok("mock seed data removed");

const oauth = fs.readFileSync(path.join(root, "server/src/routes/oauth.js"), "utf8");
const metaLib = fs.readFileSync(path.join(root, "server/src/lib/meta.js"), "utf8");
if (
  (!oauth.includes("/meta/callback") && !oauth.includes("/:platform/callback")) ||
  !metaLib.includes("buildMetaOAuthUrl")
) {
  fail("Meta OAuth route missing");
} else ok("Meta OAuth route present");

const ai = fs.readFileSync(path.join(root, "server/src/routes/ai.js"), "utf8");
const openaiLib = fs.readFileSync(path.join(root, "server/src/lib/openai.js"), "utf8");
if (!ai.includes("/generate-content") || !openaiLib.includes("responses.create")) {
  fail("OpenAI Responses API generate-content route missing");
} else ok("OpenAI Responses API generate-content present");

const worker = fs.readFileSync(path.join(root, "server/src/worker/publisherWorker.js"), "utf8");
const mockPub = fs.readFileSync(path.join(root, "server/src/lib/publishers/mockPublisher.js"), "utf8");
const posts = fs.readFileSync(path.join(root, "server/src/routes/posts.js"), "utf8");
if (
  !worker.includes("claimDuePosts") ||
  !mockPub.includes("publishWithMockAdapter") ||
  !posts.includes("/:id/cancel") ||
  !posts.includes("/:id/retry")
) {
  fail("Sprint 4 publisher queue missing");
} else ok("Sprint 4 publisher queue + mock adapter present");

const oauthRoutes = fs.readFileSync(path.join(root, "server/src/routes/oauth.js"), "utf8");
const oauthRegistry = fs.readFileSync(path.join(root, "server/src/lib/oauth/registry.js"), "utf8");
if (
  !oauthRoutes.includes("/:platform/start") ||
  !oauthRegistry.includes("youtubeProvider") ||
  !oauthRegistry.includes("linkedinProvider") ||
  !oauthRegistry.includes("xProvider")
) {
  fail("Sprint 5 multi-provider OAuth missing");
} else ok("Sprint 5 multi-provider OAuth present");

const leadsRoutes = fs.readFileSync(path.join(root, "server/src/routes/leads.js"), "utf8");
const leadsLib = fs.readFileSync(path.join(root, "server/src/lib/leads.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "server/prisma/schema.prisma"), "utf8");
if (
  !leadsRoutes.includes('router.patch("/:id/stage"') ||
  !leadsRoutes.includes('router.get("/stats"') ||
  !leadsLib.includes("LEAD_STAGES") ||
  !schema.includes("model Lead") ||
  !schema.includes("model LeadNote") ||
  !schema.includes("model LeadStatusHistory")
) {
  fail("Sprint 6 CRM leads module missing");
} else ok("Sprint 6 CRM leads module present");

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
