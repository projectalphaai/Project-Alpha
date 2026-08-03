/**
 * Map provider/technical errors to user-friendly messages (Sprint 8).
 */
export function friendlyPublishError(raw, { platform } = {}) {
  const msg = String(raw || "Publishing failed.").trim();
  const lower = msg.toLowerCase();

  if (/no .* account connected|connect an active/i.test(msg)) {
    return {
      code: "NO_CONNECTION",
      message: `Connect your ${platform || "social"} account in Social Connections, then retry.`
    };
  }
  if (/reconnect|token refresh failed|expired|invalid access token|session has been invalidated/i.test(lower)) {
    return {
      code: "RECONNECT_REQUIRED",
      message: "Your connection expired. Click Reconnect under Social Connections, then retry the post."
    };
  }
  if (/image url|mediaurl|media_url|public image/i.test(lower)) {
    return {
      code: "MEDIA_REQUIRED",
      message: "Instagram needs a public image URL. Add a media URL that Meta can download, then retry."
    };
  }
  if (/permission|(#10)|oauth exception|not authorized|pages_manage_posts|instagram_content_publish/i.test(lower)) {
    return {
      code: "PERMISSIONS",
      message: "Meta denied permission for this action. Reconnect and grant publish permissions, then ensure App Review is approved for production users."
    };
  }
  if (/rate limit|too many calls|(#4)|(#17)|(#32)/i.test(lower)) {
    return {
      code: "RATE_LIMIT",
      message: "Meta rate limit hit. We will retry automatically. If this persists, wait a few minutes."
    };
  }
  if (/meta api is not configured|meta_app_id/i.test(lower)) {
    return {
      code: "NOT_CONFIGURED",
      message: "Publishing is not configured on the server. Contact support."
    };
  }
  if (/mock publisher/i.test(lower)) {
    return {
      code: "MOCK",
      message: "Mock publishing is only for local development."
    };
  }

  return {
    code: "PUBLISH_FAILED",
    message: msg.length > 280 ? `${msg.slice(0, 277)}...` : msg
  };
}

export function friendlyConnectionError(raw) {
  const msg = String(raw || "Connection check failed.").trim();
  const lower = msg.toLowerCase();
  if (/not configured|meta_app/i.test(lower)) {
    return "Social API credentials are missing on the server.";
  }
  if (/expired|invalid|reconnect/i.test(lower)) {
    return "Connection is unhealthy. Reconnect this account.";
  }
  if (/does not support live token validation/i.test(lower)) {
    return "Live health checks are available for Instagram and Facebook only.";
  }
  return msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
}
