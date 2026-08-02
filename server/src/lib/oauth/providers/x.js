import crypto from "crypto";
import { config } from "../../../config.js";

const AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const ME_URL = "https://api.twitter.com/2/users/me";

const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

function assertConfigured() {
  if (!config.x.clientId) {
    const err = new Error("X OAuth is not configured. Set X_CLIENT_ID (and X_CLIENT_SECRET if confidential).");
    err.status = 503;
    throw err;
  }
}

function basicAuthHeader() {
  if (!config.x.clientSecret) return null;
  const raw = `${config.x.clientId}:${config.x.clientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const xProvider = {
  id: "x",
  label: "X",
  usesPkce: true,
  isConfigured() {
    return Boolean(config.x.clientId);
  },
  getAuthorizeUrl({ state, codeChallenge }) {
    assertConfigured();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.x.clientId,
      redirect_uri: config.x.redirectUri,
      scope: SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    return `${AUTH_URL}?${params.toString()}`;
  },
  async exchangeCode({ code, codeVerifier }) {
    assertConfigured();
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: config.x.clientId,
      redirect_uri: config.x.redirectUri,
      code_verifier: codeVerifier
    });
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    const basic = basicAuthHeader();
    if (basic) headers.Authorization = basic;

    const tokenRes = await fetch(TOKEN_URL, { method: "POST", headers, body });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      const err = new Error(tokenData.error_description || tokenData.error || "X token exchange failed.");
      err.status = 400;
      throw err;
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000)
      : null;

    const meRes = await fetch(`${ME_URL}?user.fields=name,username`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const meData = await meRes.json();
    if (!meRes.ok || !meData.data?.id) {
      const err = new Error(meData.detail || meData.title || "Failed to load X user profile.");
      err.status = 400;
      throw err;
    }

    return [
      {
        accountId: String(meData.data.id),
        accountName: meData.data.name || "X Account",
        accountUsername: meData.data.username || "",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || "",
        pageId: "",
        pageAccessToken: "",
        expiresAt,
        scopes: SCOPES,
        metadata: { provider: "x" }
      }
    ];
  },
  async refreshAccessToken({ refreshToken }) {
    assertConfigured();
    if (!refreshToken) {
      const err = new Error("Missing X refresh token. Please reconnect.");
      err.status = 409;
      throw err;
    }
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_id: config.x.clientId
    });
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    const basic = basicAuthHeader();
    if (basic) headers.Authorization = basic;

    const res = await fetch(TOKEN_URL, { method: "POST", headers, body });
    const data = await res.json();
    if (!res.ok || data.error) {
      const err = new Error(data.error_description || data.error || "X refresh failed.");
      err.status = 400;
      throw err;
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null
    };
  },
  createPkcePair
};
