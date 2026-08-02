import { prisma } from "../lib/prisma.js";
import { logActivity } from "../lib/activity.js";
import { publisherAdapter } from "../lib/publishers/mockPublisher.js";

let timer = null;
let ticking = false;

export function getPublisherWorkerConfig() {
  const enabled = String(process.env.ENABLE_PUBLISH_WORKER || "true").toLowerCase() !== "false";
  const intervalMs = Math.max(1000, Number(process.env.PUBLISH_WORKER_INTERVAL_MS || 5000));
  const batchSize = Math.max(1, Number(process.env.PUBLISH_WORKER_BATCH_SIZE || 10));
  return { enabled, intervalMs, batchSize, adapter: publisherAdapter.name };
}

/**
 * Claim due scheduled posts atomically (status must still be "scheduled").
 */
export async function claimDuePosts(limit = 10) {
  const now = new Date();
  const due = await prisma.scheduledPost.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now }
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true }
  });

  const claimed = [];
  for (const row of due) {
    const result = await prisma.scheduledPost.updateMany({
      where: { id: row.id, status: "scheduled" },
      data: {
        status: "processing",
        lastAttemptAt: now,
        errorMessage: ""
      }
    });
    if (result.count === 1) {
      const post = await prisma.scheduledPost.findUnique({ where: { id: row.id } });
      if (post) claimed.push(post);
    }
  }
  return claimed;
}

export async function processClaimedPost(post) {
  const attemptCount = (post.attemptCount || 0) + 1;
  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { attemptCount }
  });

  let result;
  try {
    result = await publisherAdapter.publish(post);
  } catch (err) {
    result = { ok: false, error: "Publisher adapter threw an unexpected error." };
    console.error("Publisher adapter error:", err?.name || "Error");
  }

  if (result?.ok) {
    const published = await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        status: "published",
        publishedAt: new Date(),
        externalPostId: result.externalPostId || "",
        errorMessage: ""
      }
    });
    await logActivity({
      userId: post.userId,
      postId: post.id,
      type: "publish",
      message: `Published ${post.platform} post via ${publisherAdapter.name} adapter`,
      meta: { platform: post.platform, externalPostId: published.externalPostId, attemptCount }
    });
    return published;
  }

  const errorMessage = String(result?.error || "Publishing failed.").slice(0, 500);
  const maxAttempts = post.maxAttempts || 3;
  const failed = await prisma.scheduledPost.update({
    where: { id: post.id },
    data: {
      status: "failed",
      errorMessage,
      lastAttemptAt: new Date()
    }
  });
  await logActivity({
    userId: post.userId,
    postId: post.id,
    type: "fail",
    message: `Publish failed for ${post.platform} post (attempt ${attemptCount}/${maxAttempts})`,
    meta: { platform: post.platform, errorMessage, attemptCount, maxAttempts }
  });
  return failed;
}

export async function runPublishCycle(batchSize = 10) {
  const claimed = await claimDuePosts(batchSize);
  const results = [];
  for (const post of claimed) {
    results.push(await processClaimedPost(post));
  }
  return { claimed: claimed.length, processed: results.length };
}

export function startPublisherWorker() {
  const cfg = getPublisherWorkerConfig();
  if (!cfg.enabled) {
    console.log("Publish worker disabled (ENABLE_PUBLISH_WORKER=false)");
    return { stop: () => {} };
  }
  if (timer) return { stop: stopPublisherWorker };

  console.log(
    `Publish worker started (adapter=${cfg.adapter}, interval=${cfg.intervalMs}ms, batch=${cfg.batchSize})`
  );

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await runPublishCycle(cfg.batchSize);
    } catch (err) {
      console.error("Publish worker cycle failed:", err?.message || err);
    } finally {
      ticking = false;
    }
  };

  timer = setInterval(tick, cfg.intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  // Kick once shortly after boot so due posts don't wait a full interval.
  setTimeout(tick, 750).unref?.();

  return { stop: stopPublisherWorker };
}

export function stopPublisherWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
