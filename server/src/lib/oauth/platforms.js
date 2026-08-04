export const OAUTH_PLATFORMS = [
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "x",
  "tiktok",
  "pinterest"
];

export const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
  pinterest: "Pinterest"
};

// Platforms with a real (or mock-simulated) OAuth path today. TikTok/Pinterest
// are registered in the architecture (routes, DB, UI) but intentionally not
// implemented yet — see server/src/lib/oauth/providers/{tiktok,pinterest}.js.
export const COMING_SOON_PLATFORMS = new Set(["tiktok", "pinterest"]);

export function isOAuthPlatform(platform) {
  return OAUTH_PLATFORMS.includes(String(platform || "").toLowerCase());
}
