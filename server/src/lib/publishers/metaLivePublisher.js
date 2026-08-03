import { prisma } from "../prisma.js";
import { ensureFreshConnectionSecrets } from "../oauth/tokenService.js";
import {
  createInstagramMediaContainer,
  publishFacebookPagePost,
  publishInstagramMediaContainer
} from "../metaPublish.js";
import { metaGraphGet } from "../meta.js";
import { friendlyPublishError } from "../friendlyErrors.js";

/**
 * Live Meta publisher for Instagram + Facebook Pages (production path).
 */
export async function publishWithMetaLiveAdapter(post) {
  const platform = String(post.platform || "").toLowerCase();
  if (platform !== "instagram" && platform !== "facebook") {
    return fail(
      platform,
      `Live publishing supports Instagram and Facebook only (got "${post.platform}").`
    );
  }

  const connection = await prisma.connectedAccount.findFirst({
    where: {
      userId: post.userId,
      platform,
      status: { not: "revoked" }
    },
    orderBy: [{ reconnectRequired: "asc" }, { connectedAt: "desc" }]
  });

  if (!connection) {
    return fail(
      platform,
      `No ${platform} account connected. Connect ${platform} in Social Connections, then retry.`
    );
  }

  if (connection.reconnectRequired || connection.status === "expired") {
    return fail(platform, "Token expired. Reconnect the account and retry.");
  }

  let secrets;
  try {
    secrets = await ensureFreshConnectionSecrets(connection);
  } catch (err) {
    return fail(platform, err.message || "Token refresh failed. Reconnect the account and retry.");
  }

  const pageAccessToken = secrets.pageAccessToken || secrets.accessToken;
  if (!pageAccessToken) {
    return fail(platform, "Connected account has no usable page access token. Reconnect and retry.");
  }

  try {
    if (platform === "facebook") {
      const pageId = connection.pageId || connection.accountId;
      const result = await publishFacebookPagePost({
        pageId,
        pageAccessToken,
        message: post.caption || "",
        link: isHttpUrl(post.mediaUrl) ? post.mediaUrl : undefined
      });
      if (!result.externalPostId) {
        return fail(platform, "Facebook Graph returned no post id.");
      }
      return { ok: true, externalPostId: result.externalPostId, adapter: "meta-live" };
    }

    if (!isHttpUrl(post.mediaUrl)) {
      return fail(
        platform,
        "Instagram publishing requires a public image URL in mediaUrl (Meta Content Publishing API)."
      );
    }

    const igUserId = connection.accountId;
    const container = await createInstagramMediaContainer({
      igUserId,
      pageAccessToken,
      imageUrl: post.mediaUrl,
      caption: post.caption || ""
    });

    const creationId = container.id;
    if (!creationId) {
      return fail(platform, "Instagram media container creation returned no id.");
    }

    await waitForInstagramContainer(igUserId, pageAccessToken, creationId);

    const published = await publishInstagramMediaContainer({
      igUserId,
      pageAccessToken,
      creationId
    });

    const externalPostId = String(published.id || "");
    if (!externalPostId) {
      return fail(platform, "Instagram media_publish returned no id.");
    }
    return { ok: true, externalPostId, adapter: "meta-live" };
  } catch (err) {
    return fail(platform, err.message || "Meta Graph publish failed.");
  }
}

function fail(platform, raw) {
  const friendly = friendlyPublishError(raw, { platform });
  return {
    ok: false,
    error: friendly.message,
    errorCode: friendly.code,
    rawError: String(raw || "").slice(0, 500)
  };
}

async function waitForInstagramContainer(_igUserId, pageAccessToken, creationId, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const status = await metaGraphGet(
      `/${encodeURIComponent(creationId)}`,
      pageAccessToken,
      "status_code,status"
    );
    const code = String(status.status_code || "").toUpperCase();
    if (code === "FINISHED" || code === "PUBLISHED") return status;
    if (code === "ERROR" || code === "EXPIRED") {
      const err = new Error(
        status.status || `Instagram media container failed (${code || "ERROR"}).`
      );
      err.status = 400;
      throw err;
    }
    await sleep(1500);
  }
  return { status_code: "IN_PROGRESS" };
}

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || ""));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const metaLivePublisherAdapter = {
  name: "meta-live",
  publish: publishWithMetaLiveAdapter
};
