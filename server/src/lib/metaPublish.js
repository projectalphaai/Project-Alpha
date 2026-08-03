import { metaGraphPost } from "./meta.js";

/**
 * Create a text post on a Facebook Page (Graph /{page-id}/feed).
 * Wired by Sprint 7 Module 4 publisher; exposed here as Graph integration surface.
 */
export async function publishFacebookPagePost({ pageId, pageAccessToken, message, link }) {
  if (!pageId || !pageAccessToken) {
    const err = new Error("pageId and pageAccessToken are required to publish to Facebook.");
    err.status = 400;
    throw err;
  }
  if (!message?.trim() && !link) {
    const err = new Error("Facebook posts require a message and/or link.");
    err.status = 400;
    throw err;
  }

  const body = {};
  if (message?.trim()) body.message = message.trim();
  if (link) body.link = link;

  const result = await metaGraphPost(`/${encodeURIComponent(pageId)}/feed`, pageAccessToken, body);
  return {
    externalPostId: String(result.id || ""),
    raw: result
  };
}

/**
 * Instagram Content Publishing — create media container.
 */
export async function createInstagramMediaContainer({
  igUserId,
  pageAccessToken,
  imageUrl,
  caption
}) {
  if (!igUserId || !pageAccessToken || !imageUrl) {
    const err = new Error(
      "igUserId, pageAccessToken, and imageUrl are required for Instagram publishing."
    );
    err.status = 400;
    throw err;
  }
  return metaGraphPost(`/${encodeURIComponent(igUserId)}/media`, pageAccessToken, {
    image_url: imageUrl,
    caption: caption || ""
  });
}

/**
 * Instagram Content Publishing — publish finished container.
 */
export async function publishInstagramMediaContainer({ igUserId, pageAccessToken, creationId }) {
  if (!igUserId || !pageAccessToken || !creationId) {
    const err = new Error("igUserId, pageAccessToken, and creationId are required.");
    err.status = 400;
    throw err;
  }
  return metaGraphPost(`/${encodeURIComponent(igUserId)}/media_publish`, pageAccessToken, {
    creation_id: creationId
  });
}
