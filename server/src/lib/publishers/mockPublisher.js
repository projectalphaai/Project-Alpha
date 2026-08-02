/**
 * Replaceable publisher adapter.
 * Sprint 4 uses a mock that simulates network publish latency.
 * Later swaps: InstagramPublisher / FacebookPublisher implementing the same contract.
 *
 * Contract:
 *   publish({ id, platform, caption, mediaUrl }) =>
 *     { ok: true, externalPostId } | { ok: false, error }
 */

const FORCE_FAIL_TOKEN = "[FORCE_FAIL]";

export async function publishWithMockAdapter(post, options = {}) {
  const delayMs = Number(options.delayMs ?? process.env.MOCK_PUBLISH_DELAY_MS ?? 400);
  const failRate = Number(options.failRate ?? process.env.MOCK_PUBLISH_FAIL_RATE ?? 0);

  await sleep(Math.max(0, delayMs));

  if (String(post.caption || "").includes(FORCE_FAIL_TOKEN)) {
    return {
      ok: false,
      error: "Mock publisher forced failure ([FORCE_FAIL] in caption)."
    };
  }

  if (failRate > 0 && Math.random() < failRate) {
    return {
      ok: false,
      error: "Mock publisher simulated transient network failure."
    };
  }

  const externalPostId = `mock_${post.platform}_${post.id}_${Date.now()}`;
  return { ok: true, externalPostId };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const publisherAdapter = {
  name: "mock",
  publish: publishWithMockAdapter
};
