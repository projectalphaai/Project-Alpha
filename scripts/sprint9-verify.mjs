/**
 * Sprint 9 — first paying customer readiness verify
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../server/src/lib/prisma.js";

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
log("Health sprint 9", health.sprint === 9, `sprint=${health.sprint}`);
log("Health billing block", Boolean(health.billing), JSON.stringify(health.billing));

const requiredFiles = [
  "server/src/routes/billing.js",
  "server/src/routes/admin.js",
  "server/src/lib/entitlements.js",
  "server/src/lib/mailer.js",
  "pages/onboarding.html",
  "pages/forgot-password.html",
  "pages/reset-password.html",
  "pages/verify-email.html",
  "DEPLOYMENT.md",
  "MONITORING.md",
  "FIRST_INVOICE.md"
];
for (const rel of requiredFiles) {
  log(`File ${rel}`, fs.existsSync(path.join(root, rel)));
}

let token = "";
let userId = "";
const email = `s9_${Date.now()}@example.com`;
{
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPass123!",
      name: "Sprint9"
    })
  });
  const json = await res.json();
  token = json.token || "";
  userId = json.user?.id || "";
  log("JWT signup", !!token);
  log(
    "Signup onboarding incomplete",
    json.user?.onboardingComplete === false,
    JSON.stringify({ onboardingComplete: json.user?.onboardingComplete })
  );
  log("Signup billing payload", Boolean(json.user?.billing), JSON.stringify(json.user?.billing));
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
  const onb = await api("/api/auth/onboarding", {
    method: "POST",
    body: { workspaceName: "Sprint9 Workspace", timezone: "UTC" }
  });
  log(
    "Workspace onboarding",
    onb.res.ok && onb.json?.user?.onboardingComplete === true,
    onb.json?.user?.workspaceName
  );
}

{
  const forgot = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const json = await forgot.json();
  log("Forgot password endpoint", forgot.ok && json.ok);
}

{
  const bill = await api("/api/billing/status");
  log(
    "Billing status endpoint",
    bill.res.ok && bill.json?.billing,
    JSON.stringify(bill.json?.billing)
  );
}

{
  const checkout = await api("/api/billing/checkout-session", { method: "POST" });
  const configured = Boolean(health.billing?.configured);
  if (configured) {
    log("Checkout session (Stripe configured)", checkout.res.ok && Boolean(checkout.json?.url));
  } else {
    log(
      "Checkout session honest 503 without Stripe",
      checkout.res.status === 503,
      checkout.json?.error
    );
  }
}

{
  const admin = await api("/api/admin/overview");
  log("Admin overview gated (403 for normal user)", admin.res.status === 403);
}

{
  // Entitlement: with BILLING_ENFORCE=false (typical local), generate/schedule allowed.
  // Force a paid-gate check by temporarily marking subscription none is already default;
  // when enforce is off, hasPaidAccess is true.
  const gen = await api("/api/ai/generate-content", {
    method: "POST",
    body: {
      platform: "instagram",
      contentGoal: "awareness",
      tone: "friendly",
      topic: "Sprint 9 readiness check"
    }
  });
  if (health.billing?.enforce) {
    log(
      "AI generate blocked when billing enforced + unpaid",
      gen.res.status === 402 || gen.json?.code === "PAYMENT_REQUIRED",
      `status=${gen.res.status}`
    );
  } else {
    log(
      "AI generate allowed when billing not enforced",
      gen.res.ok ||
        gen.res.status === 503 ||
        gen.res.status === 502 ||
        gen.res.status === 429 ||
        gen.res.status === 400,
      `status=${gen.res.status}`
    );
  }
}

{
  const future = new Date(Date.now() + 3600_000).toISOString();
  const sched = await api("/api/posts", {
    method: "POST",
    body: {
      platform: "linkedin",
      caption: "Sprint 9 schedule check",
      scheduledAt: future,
      status: "scheduled"
    }
  });
  if (health.billing?.enforce) {
    log(
      "Schedule blocked when billing enforced + unpaid",
      sched.res.status === 402,
      `status=${sched.res.status}`
    );
  } else {
    log("Schedule allowed when billing not enforced", sched.res.ok, `status=${sched.res.status}`);
  }
}

{
  // Password reset token path via DB (no email required)
  const raw = "sprint9_reset_token_verify_abcdef";
  const crypto = await import("crypto");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: new Date(Date.now() + 3600_000)
    }
  });
  const reset = await fetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: raw, password: "NewPass123!" })
  });
  const resetJson = await reset.json();
  log("Reset password with token", reset.ok && resetJson.ok);
}

{
  const dash = fs.readFileSync(path.join(root, "pages/dashboard.html"), "utf8");
  log("Settings billing UI present", dash.includes("billing-checkout-btn"));
  log("Platform admin panel present", dash.includes("platform-admin-panel"));
}

await prisma.$disconnect().catch(() => {});

const failed = results.filter((r) => !r.pass);
console.log(`\nSprint 9 verify: ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
