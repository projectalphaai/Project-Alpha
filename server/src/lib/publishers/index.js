import { publisherAdapter as mockAdapter } from "./mockPublisher.js";
import { metaLivePublisherAdapter } from "./metaLivePublisher.js";

const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const META_PLATFORMS = new Set(["instagram", "facebook"]);

function metaConfigured() {
  return Boolean((process.env.META_APP_ID || "").trim() && (process.env.META_APP_SECRET || "").trim());
}

/**
 * Resolve the base publisher adapter.
 * PUBLISH_ADAPTER=mock|meta-live|auto
 *
 * Production rules (Sprint 8):
 * - mock is forbidden unless ALLOW_MOCK_PUBLISH=true
 * - Instagram/Facebook never use mock when Meta credentials exist
 */
export function resolvePublisherAdapter() {
  const mode = String(process.env.PUBLISH_ADAPTER || "auto").toLowerCase();
  const allowMock =
    String(process.env.ALLOW_MOCK_PUBLISH || "").toLowerCase() === "true";

  if (mode === "mock") {
    if (isProd && !allowMock) {
      throw new Error(
        "PUBLISH_ADAPTER=mock is blocked in production. Set META credentials and PUBLISH_ADAPTER=auto|meta-live, or set ALLOW_MOCK_PUBLISH=true for emergency diagnostics only."
      );
    }
    return mockAdapter;
  }

  if (mode === "meta-live" || mode === "live") {
    if (!metaConfigured()) {
      throw new Error(
        "PUBLISH_ADAPTER=meta-live requires META_APP_ID and META_APP_SECRET."
      );
    }
    return metaLivePublisherAdapter;
  }

  // auto (default)
  if (metaConfigured()) return metaLivePublisherAdapter;

  if (isProd && !allowMock) {
    throw new Error(
      "Production publishing requires META_APP_ID and META_APP_SECRET. Mock publishing is disabled in production."
    );
  }

  return mockAdapter;
}

/**
 * Hybrid publish: IG/FB always go through meta-live when Meta is configured.
 * Other platforms are rejected in production (lean beta — no fake success).
 */
export async function publishScheduledPost(post) {
  const platform = String(post.platform || "").toLowerCase();

  if (META_PLATFORMS.has(platform)) {
    if (!metaConfigured()) {
      if (isProd && String(process.env.ALLOW_MOCK_PUBLISH || "").toLowerCase() !== "true") {
        return {
          ok: false,
          error: "Instagram/Facebook publishing is not configured. Contact support.",
          errorCode: "NOT_CONFIGURED"
        };
      }
      // Local/dev only: allow mock for Meta platforms when credentials missing
      return mockAdapter.publish(post);
    }
    return metaLivePublisherAdapter.publish(post);
  }

  if (isProd) {
    return {
      ok: false,
      error: `${platform} publishing is not available in beta. Use Instagram or Facebook.`,
      errorCode: "PLATFORM_UNSUPPORTED"
    };
  }

  const active = resolvePublisherAdapter();
  if (active.name === "meta-live") {
    return {
      ok: false,
      error: `${platform} is not supported by the live Meta adapter. Use Instagram or Facebook.`,
      errorCode: "PLATFORM_UNSUPPORTED"
    };
  }
  return active.publish(post);
}

export function getPublisherAdapterInfo() {
  try {
    const adapter = resolvePublisherAdapter();
    return {
      ok: true,
      name: adapter.name,
      mode: process.env.PUBLISH_ADAPTER || "auto",
      mockAllowedInProduction: String(process.env.ALLOW_MOCK_PUBLISH || "").toLowerCase() === "true",
      productionSafe: adapter.name !== "mock" || !isProd,
      metaConfigured: metaConfigured()
    };
  } catch (err) {
    return {
      ok: false,
      name: null,
      mode: process.env.PUBLISH_ADAPTER || "auto",
      error: err.message,
      productionSafe: false,
      metaConfigured: metaConfigured()
    };
  }
}

let cached;
try {
  cached = resolvePublisherAdapter();
} catch {
  cached = mockAdapter;
}

export const publisherAdapter = {
  get name() {
    try {
      return resolvePublisherAdapter().name;
    } catch {
      return cached?.name || "unconfigured";
    }
  },
  async publish(post) {
    return publishScheduledPost(post);
  }
};
