import "dotenv/config";

const BASE = "http://127.0.0.1:3000";
const results = [];
const log = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` | ${detail}` : ""}`);
};

let token = "";
const email = `s6_${Date.now()}@example.com`;

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
  log("Health sprint 6", h.res.ok && h.json?.sprint === 6, `sprint=${h.json?.sprint}`);
}

{
  const s = await req(
    "/api/auth/signup",
    { method: "POST", body: { email, password: "TestPass123!", name: "Sprint6 Owner" } },
    false
  );
  token = s.json?.token || "";
  log("JWT signup", !!token);
  const unauth = await req("/api/leads", {}, false);
  log("RBAC/JWT protects leads", unauth.res.status === 401);
}

let leadId = null;
{
  const create = await req("/api/leads", {
    method: "POST",
    body: {
      name: "Acme Agency",
      email: "hello@acme.test",
      phone: "+1-555-0100",
      company: "Acme Co",
      stage: "new",
      tags: ["inbound", "hot"],
      socialLinks: { linkedin: "https://linkedin.com/company/acme", website: "https://acme.test" },
      followUpAt: new Date(Date.now() + 86400000).toISOString()
    }
  });
  leadId = create.json?.lead?.id;
  log(
    "Create lead",
    create.res.status === 201 && create.json?.lead?.stage === "new" && create.json?.lead?.tags?.includes("hot"),
    leadId || create.json?.error
  );
}

{
  const bad = await req("/api/leads", { method: "POST", body: { name: "x" } });
  log("Validate lead input", bad.res.status === 400);
}

{
  const edit = await req(`/api/leads/${leadId}`, {
    method: "PUT",
    body: {
      name: "Acme Agency Updated",
      email: "hello@acme.test",
      phone: "+1-555-0100",
      company: "Acme Co",
      stage: "contacted",
      tags: ["inbound"],
      socialLinks: { linkedin: "https://linkedin.com/company/acme" }
    }
  });
  log("Edit lead", edit.res.ok && edit.json?.lead?.name.includes("Updated") && edit.json?.lead?.stage === "contacted");
}

{
  for (const stage of ["qualified", "proposal", "won"]) {
    const move = await req(`/api/leads/${leadId}/stage`, {
      method: "PATCH",
      body: { stage, note: `Move to ${stage}` }
    });
    if (!move.res.ok) {
      log(`Stage ${stage}`, false, move.json?.error);
      break;
    }
    if (stage === "won") log("Stage progression to Won", move.json?.lead?.stage === "won");
  }
}

{
  const lostCreate = await req("/api/leads", {
    method: "POST",
    body: { name: "Lost Prospect", email: "lost@test.com", stage: "new" }
  });
  const id = lostCreate.json?.lead?.id;
  const lost = await req(`/api/leads/${id}/stage`, { method: "PATCH", body: { stage: "lost" } });
  log("Stage Lost works", lost.res.ok && lost.json?.lead?.stage === "lost");
  await req(`/api/leads/${id}`, { method: "DELETE" });
}

{
  const note = await req(`/api/leads/${leadId}/notes`, {
    method: "POST",
    body: { body: "Discovery call completed. Budget confirmed." }
  });
  log("Add note", note.res.status === 201 && !!note.json?.note?.id);

  const detail = await req(`/api/leads/${leadId}`);
  log(
    "Notes + status history",
    detail.res.ok &&
      (detail.json?.lead?.notes || []).length > 0 &&
      (detail.json?.lead?.statusHistory || []).length > 0,
    `notes=${detail.json?.lead?.notes?.length} history=${detail.json?.lead?.statusHistory?.length}`
  );

  const timeline = await req(`/api/leads/${leadId}/timeline`);
  log("Activity timeline", timeline.res.ok && (timeline.json?.timeline || []).length > 0);
}

{
  const list = await req("/api/leads?q=Acme");
  log("Search works", list.res.ok && (list.json?.leads || []).some((l) => l.id === leadId));
  const filtered = await req("/api/leads?stage=won&tag=inbound");
  log("Filters work", filtered.res.ok && (filtered.json?.leads || []).every((l) => l.stage === "won"));
}

{
  const stats = await req("/api/leads/stats");
  log(
    "Dashboard counters",
    stats.res.ok &&
      typeof stats.json?.total === "number" &&
      stats.json?.byStage &&
      typeof stats.json?.followUpsDue === "number",
    `total=${stats.json?.total}`
  );
}

{
  const act = await req("/api/activity?limit=30");
  const types = new Set((act.json?.activity || []).map((a) => a.type));
  log(
    "Audit logs",
    act.res.ok && [...types].some((t) => String(t).startsWith("lead_")),
    [...types].filter((t) => String(t).startsWith("lead_")).join(",")
  );
}

{
  const del = await req(`/api/leads/${leadId}`, { method: "DELETE" });
  const list = await req("/api/leads");
  log("Delete lead", del.res.ok && !(list.json?.leads || []).some((l) => l.id === leadId));
}

{
  const fs = await import("fs");
  const html = fs.readFileSync("pages/dashboard.html", "utf8");
  const js = fs.readFileSync("js/dashboard.js", "utf8");
  log(
    "Kanban + DnD UI wired",
    html.includes('data-dropzone="proposal"') &&
      html.includes('data-dropzone="won"') &&
      html.includes('data-dropzone="lost"') &&
      js.includes("renderCrmBoard") &&
      js.includes("dragstart") &&
      js.includes("/api/leads/") &&
      !js.includes('["ai-agents", "leads", "crm"')
  );
}

const failed = results.filter((r) => !r.pass);
console.log("\n--- Summary ---");
console.log(`PASS=${results.length - failed.length} FAIL=${failed.length} TOTAL=${results.length}`);
failed.forEach((f) => console.log("FAIL_ITEM:", f.name, "|", f.detail));
process.exit(failed.length ? 1 : 0);
