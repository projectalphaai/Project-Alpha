import { prisma } from "../prisma.js";
import { ensureFreshConnectionSecrets } from "../oauth/tokenService.js";
import { metaGraphGet, metaGraphPost } from "../meta.js";

/**
 * Sprint 12 — Viral Clip AI: real Instagram Reels / Facebook video publishing.
 *
 * Reuses the existing ConnectedAccount + token-refresh infrastructure
 * (server/src/lib/oauth/tokenService.js) and the low-level Meta Graph helpers
 * (server/src/lib/meta.js) read-only — neither file is modified. This is a new,
 * clip-specific publish path (video/Reels container flow) because the existing
 * server/src/lib/publishers/metaLivePublisher.js only supports image/text posts.
 *
 * Honest limitation: Meta fetches `video_url`/`file_url` from Meta's own servers,
 * so this only works once the app is reachable at a public APP_URL. On localhost
 * it will surface a real Graph API fetch error rather than a fake success.
 */

const REAL_PUBLISH_PLATFORMS = new Set(["instagram", "facebook"]);

export function isRealClipPublishSupported(platform) {
  return REAL_PUBLISH_PLATFORMS.has(String(platform || "").toLowerCase());
}

async function waitForContainer(pageAccessToken, creationId, { attempts = 20, delayMs = 3000 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const status = await metaGraphGet(`/${encodeURIComponent(creationId)}`, pageAccessToken, "status_code,status");
    const code = String(status.status_code || "").toUpperCase();
    if (code === "FINISHED" || code === "PUBLISHED") return status;
    if (code === "ERROR" || code === "EXPIRED") {
      const err = new Error(status.status || `Media container failed (${code || "ERROR"}).`);
      err.status = 400;
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { status_code: "IN_PROGRESS" };
}

async function publishInstagramReel({ connection, secrets, videoUrl, caption }) {
  const pageAccessToken = secrets.pageAccessToken || secrets.accessToken;
  if (!pageAccessToken) {
    const e = new Error("Connected Instagram account has no usable page access token. Reconnect and retry.");
    e.status = 409;
    throw e;
  }
  const igUserId = connection.accountId;
  const container = await metaGraphPost(`/${encodeURIComponent(igUserId)}/media`, pageAccessToken, {
    media_type: "REELS",
    video_url: videoUrl,
    caption: caption || ""
  });
  const creationId = container.id;
  if (!creationId) {
    const e = new Error("Instagram Reels container creation returned no id.");
    e.status = 502;
    throw e;
  }
  await waitForContainer(pageAccessToken, creationId);
  const published = await metaGraphPost(`/${encodeURIComponent(igUserId)}/media_publish`, pageAccessToken, {
    creation_id: creationId
  });
  const externalPostId = String(published.id || "");
  if (!externalPostId) {
    const e = new Error("Instagram media_publish returned no id.");
    e.status = 502;
    throw e;
  }
  return { externalPostId };
}

async function publishFacebookVideo({ connection, secrets, videoUrl, caption }) {
  const pageAccessToken = secrets.pageAccessToken || secrets.accessToken;
  if (!pageAccessToken) {
    const e = new Error("Connected Facebook Page has no usable access token. Reconnect and retry.");
    e.status = 409;
    throw e;
  }
  const pageId = connection.pageId || connection.accountId;
  const result = await metaGraphPost(`/${encodeURIComponent(pageId)}/videos`, pageAccessToken, {
    file_url: videoUrl,
    description: caption || ""
  });
  const externalPostId = String(result.id || "");
  if (!externalPostId) {
    const e = new Error("Facebook video publish returned no id.");
    e.status = 502;
    throw e;
  }
  return { externalPostId };
}

export async function publishClipToMeta({ userId, platform, videoUrl, caption }) {
  const normalizedPlatform = String(platform || "").toLowerCase();
  if (!isRealClipPublishSupported(normalizedPlatform)) {
    const e = new Error(`Real publishing supports Instagram and Facebook only (got "${platform}").`);
    e.status = 400;
    throw e;
  }

  const connection = await prisma.connectedAccount.findFirst({
    where: { userId, platform: normalizedPlatform, status: { not: "revoked" } },
    orderBy: [{ reconnectRequired: "asc" }, { connectedAt: "desc" }]
  });
  if (!connection) {
    const e = new Error(`No ${normalizedPlatform} account connected. Connect it in Social Connections, then retry.`);
    e.status = 409;
    throw e;
  }
  if (connection.reconnectRequired || connection.status === "expired") {
    const e = new Error("Token expired. Reconnect the account and retry.");
    e.status = 409;
    throw e;
  }

  const secrets = await ensureFreshConnectionSecrets(connection);

  if (normalizedPlatform === "instagram") {
    return publishInstagramReel({ connection, secrets, videoUrl, caption });
  }
  return publishFacebookVideo({ connection, secrets, videoUrl, caption });
}
