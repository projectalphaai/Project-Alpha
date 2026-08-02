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
if (!dash.includes("/api/oauth/meta/start") || !dash.includes("/api/ai/generate") || !dash.includes("/api/posts")) {
  fail("dashboard.js missing Sprint 1 API wiring");
} else ok("dashboard wired to Meta OAuth, OpenAI, and posts APIs");

if (dash.includes("seedPhase1DemoData") || dash.includes("pa_phase1_seeded")) {
  fail("mock seed data still present in dashboard.js");
} else ok("mock seed data removed");

const oauth = fs.readFileSync(path.join(root, "server/src/routes/oauth.js"), "utf8");
if (!oauth.includes("graph.facebook.com") && !oauth.includes("buildMetaOAuthUrl")) {
  fail("Meta OAuth route missing");
} else ok("Meta OAuth route present");

const ai = fs.readFileSync(path.join(root, "server/src/routes/ai.js"), "utf8");
if (!ai.includes("OpenAI") || !ai.includes("chat.completions.create")) {
  fail("OpenAI route missing");
} else ok("OpenAI route present");

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
