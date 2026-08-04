/**
 * TikTok OAuth provider — Sprint 10 architecture placeholder.
 *
 * Not implemented yet: TikTok's Content Posting API requires a distinct app
 * review process and an OAuth 2.0 + PKCE flow with its own token/refresh
 * semantics. This stub registers "tiktok" as a first-class platform in the
 * generic OAuth architecture (platforms.js, registry.js, /api/oauth,
 * /api/connections, dashboard UI) so the rest of the system already treats
 * it consistently, without requiring any credentials today.
 *
 * To make this live in a future sprint:
 *  1. Add TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_OAUTH_REDIRECT_URI
 *     to server/src/config.js and .env.example (never hardcode).
 *  2. Implement getAuthorizeUrl / exchangeCode / refreshAccessToken /
 *     validateConnection below, following the shape used by
 *     providers/linkedin.js or providers/x.js.
 *  3. Remove "tiktok" from COMING_SOON_PLATFORMS in ../platforms.js.
 */

function isConfigured() {
  return false;
}

function notImplemented() {
  const err = new Error("TikTok connect is not implemented yet. Coming in a future sprint.");
  err.status = 501;
  throw err;
}

export const tiktokProvider = {
  id: "tiktok",
  label: "TikTok",
  usesPkce: true,
  isConfigured,
  getAuthorizeUrl: notImplemented,
  exchangeCode: notImplemented
};
