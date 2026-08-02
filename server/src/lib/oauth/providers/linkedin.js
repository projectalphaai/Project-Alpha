import { config } from "../../../config.js";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const ORGS_URL =
  "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))";

const SCOPES = ["openid", "profile", "email", "w_member_social"];

function assertConfigured() {
  if (!config.linkedin.clientId || !config.linkedin.clientSecret) {
    const err = new Error(
      "LinkedIn OAuth is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET."
    );
    err.status = 503;
    throw err;
  }
}

export const linkedinProvider = {
  id: "linkedin",
  label: "LinkedIn",
  usesPkce: false,
  isConfigured() {
    return Boolean(config.linkedin.clientId && config.linkedin.clientSecret);
  },
  getAuthorizeUrl({ state }) {
    assertConfigured();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.linkedin.clientId,
      redirect_uri: config.linkedin.redirectUri,
      state,
      scope: SCOPES.join(" ")
    });
    return `${AUTH_URL}?${params.toString()}`;
  },
  async exchangeCode({ code }) {
    assertConfigured();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.linkedin.redirectUri,
      client_id: config.linkedin.clientId,
      client_secret: config.linkedin.clientSecret
    });
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      const err = new Error(
        tokenData.error_description || tokenData.error || "LinkedIn token exchange failed."
      );
      err.status = 400;
      throw err;
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000)
      : null;

    const profileRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();
    if (!profileRes.ok) {
      const err = new Error(profile.message || "Failed to load LinkedIn profile.");
      err.status = 400;
      throw err;
    }

    const accounts = [
      {
        accountId: String(profile.sub || profile.id),
        accountName: profile.name || "LinkedIn Member",
        accountUsername: profile.email || profile.name || "",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || "",
        pageId: "",
        pageAccessToken: "",
        expiresAt,
        scopes: SCOPES,
        metadata: { provider: "linkedin", type: "member" }
      }
    ];

    // Best-effort org pages (requires additional Marketing Developer Platform scopes).
    try {
      const orgRes = await fetch(ORGS_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      if (orgRes.ok) {
        const orgData = await orgRes.json();
        for (const el of orgData.elements || []) {
          const org = el["organization~"];
          if (!org?.id) continue;
          accounts.push({
            accountId: String(org.id),
            accountName: org.localizedName || "LinkedIn Page",
            accountUsername: org.localizedName || "",
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || "",
            pageId: String(org.id),
            pageAccessToken: "",
            expiresAt,
            scopes: SCOPES,
            metadata: { provider: "linkedin", type: "organization" }
          });
        }
      }
    } catch {
      /* optional */
    }

    return accounts;
  },
  async refreshAccessToken({ refreshToken }) {
    assertConfigured();
    if (!refreshToken) {
      const err = new Error("Missing LinkedIn refresh token. Please reconnect.");
      err.status = 409;
      throw err;
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.linkedin.clientId,
      client_secret: config.linkedin.clientSecret
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      const err = new Error(data.error_description || data.error || "LinkedIn refresh failed.");
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
