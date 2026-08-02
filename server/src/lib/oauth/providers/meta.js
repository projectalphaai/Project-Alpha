import { config } from "../../../config.js";
import {
  assertMetaConfigured,
  buildMetaOAuthUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchFacebookPages,
  fetchFacebookProfile
} from "../../meta.js";

function isConfigured() {
  return Boolean(config.meta.appId && config.meta.appSecret);
}

async function exchangeAndLoad(code) {
  assertMetaConfigured();
  const shortLived = await exchangeCodeForToken(code);
  const longLived = await exchangeForLongLivedToken(shortLived.access_token);
  const userToken = longLived.access_token;
  const expiresIn = Number(longLived.expires_in || 0);
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  const profile = await fetchFacebookProfile(userToken);
  const pages = await fetchFacebookPages(userToken);
  return { userToken, expiresAt, profile, pages };
}

export const facebookProvider = {
  id: "facebook",
  label: "Facebook Pages",
  usesPkce: false,
  isConfigured,
  getAuthorizeUrl({ state }) {
    return buildMetaOAuthUrl({ state, platform: "facebook" });
  },
  async exchangeCode({ code }) {
    const { userToken, expiresAt, profile, pages } = await exchangeAndLoad(code);
    if (!pages.length) {
      const err = new Error(
        "No Facebook Pages found for this account. Create or grant access to a Page."
      );
      err.status = 400;
      throw err;
    }

    return pages.map((page) => ({
      accountId: String(page.id),
      accountName: page.name || "Facebook Page",
      accountUsername: page.name || "",
      accessToken: userToken,
      refreshToken: "",
      pageId: String(page.id),
      pageAccessToken: page.access_token || "",
      expiresAt,
      scopes: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "pages_manage_metadata",
        "business_management"
      ],
      metadata: { facebookUserId: profile.id, provider: "meta" }
    }));
  },
  async refreshAccessToken({ accessToken }) {
    assertMetaConfigured();
    // Meta long-lived user tokens are extended via fb_exchange_token.
    const longLived = await exchangeForLongLivedToken(accessToken);
    const expiresIn = Number(longLived.expires_in || 0);
    return {
      accessToken: longLived.access_token || accessToken,
      refreshToken: "",
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
    };
  }
};

export const instagramProvider = {
  id: "instagram",
  label: "Instagram",
  usesPkce: false,
  isConfigured,
  getAuthorizeUrl({ state }) {
    return buildMetaOAuthUrl({ state, platform: "instagram" });
  },
  async exchangeCode({ code }) {
    const { userToken, expiresAt, profile, pages } = await exchangeAndLoad(code);
    const withIg = pages.filter((p) => p.instagram_business_account?.id);
    if (!withIg.length) {
      const err = new Error(
        "No Instagram Business account linked to your Facebook Pages. Connect an Instagram Professional account to a Page first."
      );
      err.status = 400;
      throw err;
    }

    return withIg.map((page) => {
      const ig = page.instagram_business_account;
      return {
        accountId: String(ig.id),
        accountName: ig.name || ig.username || "Instagram",
        accountUsername: ig.username || "",
        accessToken: userToken,
        refreshToken: "",
        pageId: String(page.id),
        pageAccessToken: page.access_token || "",
        expiresAt,
        scopes: [
          "instagram_basic",
          "instagram_content_publish",
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_posts",
          "business_management"
        ],
        metadata: {
          facebookUserId: profile.id,
          pageName: page.name || "",
          provider: "meta"
        }
      };
    });
  },
  async refreshAccessToken({ accessToken }) {
    return facebookProvider.refreshAccessToken({ accessToken });
  }
};
