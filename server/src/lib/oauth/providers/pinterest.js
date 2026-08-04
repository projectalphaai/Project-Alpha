/**
 * Pinterest OAuth provider — Sprint 10 architecture placeholder.
 *
 * Not implemented yet. This stub registers "pinterest" as a first-class
 * platform in the generic OAuth architecture (platforms.js, registry.js,
 * /api/oauth, /api/connections, dashboard UI) so the rest of the system
 * already treats it consistently, without requiring any credentials today.
 *
 * To make this live in a future sprint:
 *  1. Add PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET /
 *     PINTEREST_OAUTH_REDIRECT_URI to server/src/config.js and .env.example
 *     (never hardcode).
 *  2. Implement getAuthorizeUrl / exchangeCode / refreshAccessToken /
 *     validateConnection below, following the shape used by
 *     providers/linkedin.js or providers/youtube.js.
 *  3. Remove "pinterest" from COMING_SOON_PLATFORMS in ../platforms.js.
 */

function isConfigured() {
  return false;
}

function notImplemented() {
  const err = new Error("Pinterest connect is not implemented yet. Coming in a future sprint.");
  err.status = 501;
  throw err;
}

export const pinterestProvider = {
  id: "pinterest",
  label: "Pinterest",
  usesPkce: false,
  isConfigured,
  getAuthorizeUrl: notImplemented,
  exchangeCode: notImplemented
};
