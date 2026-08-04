import { facebookProvider, instagramProvider } from "./providers/meta.js";
import { youtubeProvider } from "./providers/youtube.js";
import { linkedinProvider } from "./providers/linkedin.js";
import { xProvider } from "./providers/x.js";
import { tiktokProvider } from "./providers/tiktok.js";
import { pinterestProvider } from "./providers/pinterest.js";
import { OAUTH_PLATFORMS } from "./platforms.js";

const providers = {
  instagram: instagramProvider,
  facebook: facebookProvider,
  youtube: youtubeProvider,
  linkedin: linkedinProvider,
  x: xProvider,
  tiktok: tiktokProvider,
  pinterest: pinterestProvider
};

export function getProvider(platform) {
  return providers[String(platform || "").toLowerCase()] || null;
}

export function listProviders() {
  return OAUTH_PLATFORMS.map((id) => {
    const p = providers[id];
    return {
      id,
      label: p.label,
      configured: p.isConfigured(),
      usesPkce: Boolean(p.usesPkce),
      supportsRefresh: typeof p.refreshAccessToken === "function"
    };
  });
}
