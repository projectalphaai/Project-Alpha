import { config } from "../config.js";

/** Instagram Graph API via Facebook Login — Meta-documented scopes for publish readiness. */
export const INSTAGRAM_OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management"
];

export const FACEBOOK_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "business_management"
];

function graphBase() {
  return `https://graph.facebook.com/${config.meta.graphVersion}`;
}

export function assertMetaConfigured() {
  if (!config.meta.appId || !config.meta.appSecret) {
    const err = new Error(
      "Meta API is not configured. Set META_APP_ID and META_APP_SECRET in your environment."
    );
    err.status = 503;
    throw err;
  }
}

export function buildMetaOAuthUrl({ state, platform }) {
  assertMetaConfigured();

  const scopes = platform === "instagram" ? INSTAGRAM_OAUTH_SCOPES : FACEBOOK_OAUTH_SCOPES;

  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: config.meta.redirectUri,
    state,
    response_type: "code",
    scope: scopes.join(",")
  });

  if (platform === "instagram") {
    // Business Login for Instagram onboarding channel (Meta docs).
    params.set("extras", JSON.stringify({ setup: { channel: "IG_API_ONBOARDING" } }));
  }

  return `https://www.facebook.com/${config.meta.graphVersion}/dialog/oauth?${params.toString()}`;
}

async function graphGet(pathname, accessToken, fields) {
  const params = new URLSearchParams({ access_token: accessToken });
  if (fields) params.set("fields", fields);
  const res = await fetch(`${graphBase()}${pathname}?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    const err = new Error(data.error?.message || `Meta Graph request failed (${pathname}).`);
    err.status = 400;
    err.details = data.error;
    throw err;
  }
  return data;
}

export async function exchangeCodeForToken(code) {
  assertMetaConfigured();
  const params = new URLSearchParams({
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    redirect_uri: config.meta.redirectUri,
    code
  });

  const res = await fetch(`${graphBase()}/oauth/access_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw Object.assign(new Error(data.error?.message || "Failed to exchange OAuth code."), {
      status: 400,
      details: data.error
    });
  }
  return data;
}

export async function exchangeForLongLivedToken(shortLivedToken) {
  assertMetaConfigured();
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    fb_exchange_token: shortLivedToken
  });

  const res = await fetch(`${graphBase()}/oauth/access_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw Object.assign(new Error(data.error?.message || "Failed to create long-lived token."), {
      status: 400,
      details: data.error
    });
  }
  return data;
}

/**
 * Inspect a user or page token. Returns granted scopes and validity.
 * https://developers.facebook.com/docs/graph-api/reference/debug_token
 */
export async function debugMetaToken(inputToken) {
  assertMetaConfigured();
  const appToken = `${config.meta.appId}|${config.meta.appSecret}`;
  const params = new URLSearchParams({
    input_token: inputToken,
    access_token: appToken
  });
  const res = await fetch(`${graphBase()}/debug_token?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw Object.assign(new Error(data.error?.message || "Failed to debug Meta token."), {
      status: 400,
      details: data.error
    });
  }
  return data.data || {};
}

export async function fetchFacebookPages(userAccessToken) {
  const params = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username,name}",
    access_token: userAccessToken,
    limit: "100"
  });

  const res = await fetch(`${graphBase()}/me/accounts?${params.toString()}`);
  const body = await res.json();
  if (!res.ok || body.error) {
    throw Object.assign(new Error(body.error?.message || "Failed to load Facebook Pages."), {
      status: 400,
      details: body.error
    });
  }
  return Array.isArray(body.data) ? body.data : [];
}

export async function fetchFacebookProfile(userAccessToken) {
  return graphGet("/me", userAccessToken, "id,name,email");
}

/**
 * Validate an Instagram Professional account id using a Page access token.
 * Required after OAuth so we never store unverified IG account ids.
 */
export async function fetchInstagramAccount(igUserId, pageAccessToken) {
  if (!igUserId || !pageAccessToken) {
    const err = new Error("Instagram account id and Page access token are required for validation.");
    err.status = 400;
    throw err;
  }
  return graphGet(`/${encodeURIComponent(igUserId)}`, pageAccessToken, "id,username,name,profile_picture_url");
}

/**
 * Confirm the stored Instagram connection still works against Graph API.
 */
export async function validateInstagramConnection({ igUserId, pageAccessToken, userAccessToken }) {
  const account = await fetchInstagramAccount(igUserId, pageAccessToken || userAccessToken);
  let debug = null;
  try {
    debug = await debugMetaToken(pageAccessToken || userAccessToken);
  } catch {
    debug = null;
  }
  return {
    ok: true,
    account: {
      id: account.id,
      username: account.username || "",
      name: account.name || "",
      profilePictureUrl: account.profile_picture_url || ""
    },
    token: debug
      ? {
          isValid: Boolean(debug.is_valid),
          scopes: Array.isArray(debug.scopes) ? debug.scopes : [],
          expiresAt: debug.expires_at ? new Date(debug.expires_at * 1000).toISOString() : null,
          appId: debug.app_id || null
        }
      : null
  };
}

/**
 * Validate a Facebook Page connection with Graph API.
 */
export async function validateFacebookConnection({ pageId, pageAccessToken, userAccessToken }) {
  if (!pageId) {
    const err = new Error("Facebook Page id is required for validation.");
    err.status = 400;
    throw err;
  }
  const token = pageAccessToken || userAccessToken;
  if (!token) {
    const err = new Error("Facebook Page access token is required for validation.");
    err.status = 400;
    throw err;
  }

  const page = await graphGet(
    `/${encodeURIComponent(pageId)}`,
    token,
    "id,name,category,fan_count,link,picture{url}"
  );

  let debug = null;
  try {
    debug = await debugMetaToken(token);
  } catch {
    debug = null;
  }

  return {
    ok: true,
    page: {
      id: page.id,
      name: page.name || "",
      category: page.category || "",
      fanCount: page.fan_count ?? null,
      link: page.link || "",
      pictureUrl: page.picture?.data?.url || ""
    },
    token: debug
      ? {
          isValid: Boolean(debug.is_valid),
          scopes: Array.isArray(debug.scopes) ? debug.scopes : [],
          expiresAt: debug.expires_at ? new Date(debug.expires_at * 1000).toISOString() : null,
          appId: debug.app_id || null
        }
      : null
  };
}

/**
 * Low-level Graph GET helper exported for Facebook Page operations.
 */
export async function metaGraphGet(pathname, accessToken, fields) {
  return graphGet(pathname, accessToken, fields);
}

/**
 * Low-level Graph POST (form-encoded) for Page/IG publishing endpoints.
 */
export async function metaGraphPost(pathname, accessToken, body = {}) {
  assertMetaConfigured();
  const params = new URLSearchParams({ ...body, access_token: accessToken });
  const res = await fetch(`${graphBase()}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const err = new Error(data.error?.message || `Meta Graph POST failed (${pathname}).`);
    err.status = 400;
    err.details = data.error;
    err.code = data.error?.code;
    throw err;
  }
  return data;
}
