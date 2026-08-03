/**
 * Sprint 7 — Module 6: Full end-to-end architectural verification
 * Waits for API readiness, then runs module 1–5 suites.
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3000";

async function waitForApi(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) {
        const json = await res.json();
        if (json.sprint === 7) return json;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API not ready at ${BASE} within ${timeoutMs}ms`);
}

const health = await waitForApi();
console.log(`API ready (sprint=${health.sprint}, adapter=${health.publishWorker?.adapter})`);

const scripts = [
  "sprint7-module1-verify.mjs",
  "sprint7-module2-verify.mjs",
  "sprint7-module3-verify.mjs",
  "sprint7-module4-5-verify.mjs"
];

let failed = 0;
for (const name of scripts) {
  console.log(`\n===== Running ${name} =====`);
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });
  if (r.status !== 0) {
    failed += 1;
    console.error(`Module script failed: ${name} (exit ${r.status})`);
  }
}

console.log("\n===== Sprint 7 Module 6 E2E Summary =====");
if (failed) {
  console.log(`FAIL — ${failed}/${scripts.length} module suites failed`);
  process.exit(1);
}
console.log(`PASS — ${scripts.length}/${scripts.length} module suites passed`);
console.log(
  "NOTE: Live Instagram/Facebook Graph publish requires META_APP_ID, META_APP_SECRET, App Review, and a Professional IG account linked to a Page."
);
process.exit(0);
