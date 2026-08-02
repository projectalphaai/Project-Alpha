import { config } from "../../../config.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid"
];

function assertConfigured() {
  if (!config.google.clientId || !config.google.clientSecret) {
    const err = new Error(
      "YouTube OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
    );
    err.status = 503;
    throw err;
  }
}

export const youtubeProvider = {
  id: "youtube",
  label: "YouTube",
  usesPkce: false,
  isConfigured() {
    return Boolean(config.google.clientId && config.google.clientSecret);
  },
  getAuthorizeUrl({ state }) {
    assertConfigured();
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state
    });
    return `${AUTH_URL}?${params.toString()}`;
  },
  async exchangeCode({ code }) {
    assertConfigured();
    const body = new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: "authorization_code"
    });
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      const err = new Error(tokenData.error_description || tokenData.error || "YouTube token exchange failed.");
      err.status = 400;
      throw err;
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000)
      : null;

    const channelRes = await fetch(
      `${CHANNELS_URL}?part=snippet,contentDetails&mine=true`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const channelData = await channelRes.json();
    if (!channelRes.ok) {
      const err = new Error(channelData.error?.message || "Failed to load YouTube channels.");
      err.status = 400;
      throw err;
    }

    const items = Array.isArray(channelData.items) ? channelData.items : [];
    if (!items.length) {
      const err = new Error("No YouTube channels found for this Google account.");
      err.status = 400;
      throw err;
    }

    return items.map((ch) => ({
      accountId: String(ch.id),
      accountName: ch.snippet?.title || "YouTube Channel",
      accountUsername: ch.snippet?.customUrl || ch.snippet?.title || "",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || "",
      pageId: "",
      pageAccessToken: "",
      expiresAt,
      scopes: SCOPES,
      metadata: { provider: "google", channelId: ch.id }
    }));
  },
  async refreshAccessToken({ refreshToken }) {
    assertConfigured();
    if (!refreshToken) {
      const err = new Error("Missing YouTube refresh token. Please reconnect.");
      err.status = 409;
      throw err;
    }
    const body = new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      const err = new Error(data.error_description || data.error || "YouTube refresh failed.");
      err.status = 400;
      throw err;
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null
    };
  }
};
