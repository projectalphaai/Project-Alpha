import { randomToken } from "../crypto.js";

/**
 * Mock connect fallback for Instagram/Facebook.
 *
 * When META_APP_ID/META_APP_SECRET are missing (e.g. Meta Developer setup is
 * blocked or pending review), the real OAuth provider is unconfigured and
 * /api/oauth/:platform/start would normally return 503. This module lets the
 * connect flow simulate a successful connection instead, so the rest of the
 * app (scheduling gates, dashboard UI, connection health) can be exercised
 * end-to-end without real Meta credentials.
 *
 * Safety:
 * - Only applies to instagram/facebook (the two Meta-backed platforms).
 * - Never used when real Meta credentials are present.
 * - Blocked in production unless ALLOW_MOCK_CONNECT=true is explicitly set
 *   (mirrors the existing ALLOW_MOCK_PUBLISH pattern for the publish adapter).
 */

const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const MOCK_CONNECT_PLATFORMS = new Set(["instagram", "facebook"]);

const MOCK_ACCOUNT_PRESETS = {
  instagram: { name: "Demo Instagram Business", username: "demo.instagram" },
  facebook: { name: "Demo Facebook Page", username: "" }
};

export function isMockConnectPlatform(platform) {
  return MOCK_CONNECT_PLATFORMS.has(String(platform || "").toLowerCase());
}

export function isMockConnectAllowed(platform) {
  if (!isMockConnectPlatform(platform)) return false;
  const allowFlag = String(process.env.ALLOW_MOCK_CONNECT || "").toLowerCase() === "true";
  return !isProd || allowFlag;
}

export function isMockConnectionRow(row) {
  try {
    return JSON.parse(row?.metadataJson || "{}")?.mock === true;
  } catch {
    return false;
  }
}

/**
 * Fabricate account data shaped exactly like a real provider's exchangeCode()
 * result, so it flows through upsertConnectedAccounts unchanged.
 */
export function createMockAccounts(platform, { accountId = null } = {}) {
  const preset = MOCK_ACCOUNT_PRESETS[platform] || { name: `Demo ${platform}`, username: "" };
  const id = accountId || `mock_${platform}_${randomToken(6)}`;
  const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000); // mirrors Meta long-lived token lifetime

  return [
    {
      accountId: id,
      accountName: preset.name,
      accountUsername: preset.username,
      accessToken: `mock-access-${randomToken(12)}`,
      refreshToken: "",
      pageId: platform === "facebook" ? id : `mock_page_${randomToken(6)}`,
      pageAccessToken: `mock-page-access-${randomToken(12)}`,
      expiresAt,
      scopes: ["mock_connect"],
      metadata: {
        provider: "mock",
        mock: true,
        note: "Simulated connection: Meta credentials are not configured on this server."
      }
    }
  ];
}
