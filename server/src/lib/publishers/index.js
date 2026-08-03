import { publisherAdapter as mockAdapter } from "./mockPublisher.js";
import { metaLivePublisherAdapter } from "./metaLivePublisher.js";

const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

function metaConfigured() {
  return Boolean((process.env.META_APP_ID || "").trim() && (process.env.META_APP_SECRET || "").trim());
}

/**
 * Resolve the active publisher adapter.
 * PUBLISH_ADAPTER=mock|meta-live|auto
 *
 * Production rules (Sprint 8):
 * - mock is forbidden unless ALLOW_MOCK_PUBLISH=true (emergency only)
 * - auto requires Meta credentials; otherwise throws at resolve time
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

export function getPublisherAdapterInfo() {
  try {
    const adapter = resolvePublisherAdapter();
    return {
      ok: true,
      name: adapter.name,
      mode: process.env.PUBLISH_ADAPTER || "auto",
      mockAllowedInProduction: String(process.env.ALLOW_MOCK_PUBLISH || "").toLowerCase() === "true",
      productionSafe: adapter.name !== "mock" || !isProd
    };
  } catch (err) {
    return {
      ok: false,
      name: null,
      mode: process.env.PUBLISH_ADAPTER || "auto",
      error: err.message,
      productionSafe: false
    };
  }
}

let cached;
try {
  cached = resolvePublisherAdapter();
} catch {
  // Dev/boot may resolve later; worker start will re-resolve and surface errors.
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
    const active = resolvePublisherAdapter();
    return active.publish(post);
  }
};
