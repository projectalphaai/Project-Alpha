import { config } from "../config.js";

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

  const scopes =
    platform === "instagram"
      ? [
          "instagram_basic",
          "instagram_content_publish",
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_posts",
          "business_management"
        ]
      : [
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_posts",
          "pages_manage_metadata",
          "business_management"
        ];

  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: config.meta.redirectUri,
    state,
    response_type: "code",
    scope: scopes.join(",")
  });

  if (platform === "instagram") {
    params.set("extras", JSON.stringify({ setup: { channel: "IG_API_ONBOARDING" } }));
  }

  return `https://www.facebook.com/${config.meta.graphVersion}/dialog/oauth?${params.toString()}`;
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

export async function fetchFacebookPages(userAccessToken) {
  const params = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username,name}",
    access_token: userAccessToken,
    limit: "100"
  });

  const res = await fetch(`${graphBase()}/me/accounts?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw Object.assign(new Error(data.error?.message || "Failed to load Facebook Pages."), {
      status: 400,
      details: data.error
    });
  }
  return Array.isArray(data.data) ? data.data : [];
}

export async function fetchFacebookProfile(userAccessToken) {
  const params = new URLSearchParams({
    fields: "id,name,email",
    access_token: userAccessToken
  });
  const res = await fetch(`${graphBase()}/me?${params.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw Object.assign(new Error(data.error?.message || "Failed to load Facebook profile."), {
      status: 400,
      details: data.error
    });
  }
  return data;
}
