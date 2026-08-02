export const OAUTH_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "x"];

export const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X"
};

export function isOAuthPlatform(platform) {
  return OAUTH_PLATFORMS.includes(String(platform || "").toLowerCase());
}
