import "dotenv/config";

const BASE = "http://127.0.0.1:3000";
const results = [];
const log = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` | ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = "";
const email = `s4_${Date.now()}@example.com`;

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
  const { res, json } = await req("/api/health", {}, false);
  log(
    "Health sprint 4 + worker",
    res.ok && json?.sprint === 4 && json?.publishWorker?.enabled === true,
    `sprint=${json?.sprint} worker=${json?.publishWorker?.adapter}`
  );
}

{
  const signup = await req(
    "/api/auth/signup",
    { method: "POST", body: { email, password: "TestPass123!", name: "Sprint4" } },
    false
  );
  token = signup.json?.token || "";
  log("JWT signup", !!token);
  const unauth = await req(
    "/api/posts",
    {
      method: "POST",
      body: {
        platform: "instagram",
        caption: "Unauthorized schedule attempt content",
        scheduledAt: new Date(Date.now() + 3600000).toISOString()
      }
    },
    false
  );
  log("JWT required for posts", unauth.res.status === 401);
}

{
  const { res, json } = await req("/api/posts", {
    method: "POST",
    body: { platform: "myspace", caption: "short", scheduledAt: "nope" }
  });
  log("Invalid create rejected", res.status === 400, json?.error);
}

let draftId = null;
{
  const { res, json } = await req("/api/posts", {
    method: "POST",
    body: {
      platform: "linkedin",
      caption: "This is a saved draft caption for Sprint 4 verification.",
      status: "draft"
    }
  });
  draftId = json?.post?.id || null;
  log("Save draft", res.status === 201 && json?.post?.status === "draft", draftId || json?.error);
}

let postId = null;
{
  const when = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { res, json } = await req("/api/posts", {
    method: "POST",
    body: {
      platform: "instagram",
      caption: "Scheduled post for Sprint 4 calendar and queue verification.",
      scheduledAt: when,
      status: "scheduled"
    }
  });
  postId = json?.post?.id || null;
  log("Create scheduled post", res.status === 201 && json?.post?.status === "scheduled", postId || json?.error);
}

{
  const { res, json } = await req(`/api/posts/${postId}`, {
    method: "PUT",
    body: {
      platform: "facebook",
      caption: "Edited scheduled post caption for Sprint 4 verification flow.",
      scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      status: "scheduled"
    }
  });
  log("Edit scheduled post", res.ok && json?.post?.platform === "facebook", json?.post?.platform);
}

{
  const { res, json } = await req(`/api/posts/${postId}/cancel`, { method: "POST" });
  log("Cancel schedule", res.ok && json?.post?.status === "cancelled", json?.post?.status);
}

{
  const { res } = await req(`/api/posts/${postId}`, { method: "DELETE" });
  log("Delete scheduled post", res.ok);
}

let dueId = null;
{
  // Create a post already due so the worker can publish it.
  const { res, json } = await req("/api/posts", {
    method: "POST",
    body: {
      platform: "instagram",
      caption: "Due soon post that the mock publisher should publish successfully.",
      scheduledAt: new Date(Date.now() + 90 * 1000).toISOString(),
      status: "scheduled"
    }
  });
  dueId = json?.post?.id;
  // Force due by retrying after a temporary cancel? Better: use raw update via retry path.
  // Create failed then retry sets scheduledAt=now. Or create and then we update scheduledAt via cancel/retry.
  // Simpler: create failed via FORCE_FAIL then also create a success due post by scheduling in past — API blocks past.
  // Use retry after inventing failed: create with FORCE_FAIL and scheduledAt soon, wait for worker fail, then create success post.
  log("Create due-bound post", res.status === 201 && !!dueId, dueId || json?.error);

  // Immediately re-queue with scheduledAt=now using cancel? No.
  // Use Prisma-less trick: mark as failed via FORCE_FAIL wait, and separately create publishable via retry:
  // Create FORCE_FAIL post due now through retry endpoint after we first schedule in future then... 
}

// Publish success path: schedule in 1s future isn't allowed (must be future). Worker interval 5s.
// Create scheduled 1 minute ahead then manually wait? Too slow.
// Use failed + retry: create with FORCE_FAIL scheduled soon... API needs future.
// Schedule 2s ahead — API allows any future. Wait for worker.
{
  const soon = new Date(Date.now() + 1500).toISOString();
  const create = await req("/api/posts", {
    method: "POST",
    body: {
      platform: "x",
      caption: "Auto publish success path for Sprint 4 mock adapter verification.",
      scheduledAt: soon,
      status: "scheduled"
    }
  });
  const id = create.json?.post?.id;
  log("Queue publishable post", create.res.status === 201 && !!id, id);

  let published = false;
  let status = create.json?.post?.status;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const list = await req("/api/posts");
    const post = (list.json?.posts || []).find((p) => p.id === id);
    status = post?.status;
    if (status === "published") {
      published = true;
      log("Published status", true, `externalPostId=${post.externalPostId}`);
      break;
    }
    if (status === "failed") break;
  }
  if (!published) log("Published status", false, `lastStatus=${status}`);
}

// Fail + retry path
{
  const soon = new Date(Date.now() + 1500).toISOString();
  const create = await req("/api/posts", {
    method: "POST",
    body: {
      platform: "youtube",
      caption: "Force fail path [FORCE_FAIL] for Sprint 4 retry verification content.",
      scheduledAt: soon,
      status: "scheduled"
    }
  });
  const id = create.json?.post?.id;
  let failed = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const list = await req("/api/posts");
    const post = (list.json?.posts || []).find((p) => p.id === id);
    if (post?.status === "failed") {
      failed = true;
      log("Failed status", true, post.errorMessage?.slice(0, 60));
      const retry = await req(`/api/posts/${id}/retry`, { method: "POST" });
      log("Retry failed job", retry.res.ok && retry.json?.post?.status === "scheduled");
      // Remove FORCE_FAIL by editing then re-queue
      const edit = await req(`/api/posts/${id}`, {
        method: "PUT",
        body: {
          platform: "youtube",
          caption: "Recovered caption after forced failure for Sprint 4 retry publish.",
          scheduledAt: new Date(Date.now() + 1500).toISOString(),
          status: "scheduled"
        }
      });
      log("Edit after fail", edit.res.ok && edit.json?.post?.status === "scheduled");
      break;
    }
  }
  if (!failed) log("Failed status", false, "did not fail in time");
}

{
  const queue = await req("/api/posts/queue");
  log("Upcoming queue endpoint", queue.res.ok && Array.isArray(queue.json?.queue), `count=${queue.json?.queue?.length}`);
}

{
  const list = await req("/api/posts");
  log("List posts PostgreSQL", list.res.ok && Array.isArray(list.json?.posts));
}

{
  const act = await req("/api/activity?limit=20");
  const types = new Set((act.json?.activity || []).map((a) => a.type));
  log(
    "Activity log",
    act.res.ok && (act.json?.activity || []).length > 0 && (types.has("schedule") || types.has("draft")),
    `items=${act.json?.activity?.length} types=${[...types].join(",")}`
  );
}

{
  const { res } = await req(`/api/posts/${draftId}`, { method: "DELETE" });
  log("Delete draft", res.ok);
}

{
  const health = await req("/api/health", {}, false);
  const body = health.text || "";
  log("No secret leakage", !/sk-[A-Za-z0-9]{20,}/.test(body) && !body.includes(process.env.JWT_SECRET || "___"));
}

const failed = results.filter((r) => !r.pass);
console.log("\n--- Summary ---");
console.log(`PASS=${results.length - failed.length} FAIL=${failed.length} TOTAL=${results.length}`);
failed.forEach((f) => console.log("FAIL_ITEM:", f.name, f.detail || ""));
process.exit(failed.length ? 1 : 0);
