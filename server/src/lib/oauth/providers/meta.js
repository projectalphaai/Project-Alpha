import { config } from "../../../config.js";
import {
  assertMetaConfigured,
  buildMetaOAuthUrl,
  debugMetaToken,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  FACEBOOK_OAUTH_SCOPES,
  fetchFacebookPages,
  fetchFacebookProfile,
  fetchInstagramAccount,
  INSTAGRAM_OAUTH_SCOPES,
  validateFacebookConnection,
  validateInstagramConnection
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

  let grantedScopes = [];
  try {
    const debug = await debugMetaToken(userToken);
    if (Array.isArray(debug.scopes) && debug.scopes.length) {
      grantedScopes = debug.scopes;
    }
    if (debug.is_valid === false) {
      const err = new Error("Meta returned an invalid access token after OAuth exchange.");
      err.status = 400;
      throw err;
    }
  } catch (err) {
    if (err.status === 400 && /invalid access token/i.test(err.message)) throw err;
    // debug_token can fail in some app modes; continue with requested scopes.
  }

  return { userToken, expiresAt, profile, pages, grantedScopes };
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
    const { userToken, expiresAt, profile, pages, grantedScopes } = await exchangeAndLoad(code);
    if (!pages.length) {
      const err = new Error(
        "No Facebook Pages found for this account. Create or grant access to a Page."
      );
      err.status = 400;
      throw err;
    }

    const scopes = grantedScopes.filter((s) => FACEBOOK_OAUTH_SCOPES.includes(s));
    const accounts = [];

    for (const page of pages) {
      const pageAccessToken = page.access_token || "";
      if (!pageAccessToken) continue;

      let validated;
      try {
        validated = await validateFacebookConnection({
          pageId: String(page.id),
          pageAccessToken,
          userAccessToken: userToken
        });
      } catch (err) {
        const wrapped = new Error(
          `Could not validate Facebook Page "${page.name || page.id}": ${err.message}`
        );
        wrapped.status = 400;
        wrapped.details = err.details;
        throw wrapped;
      }

      accounts.push({
        accountId: String(validated.page?.id || page.id),
        accountName: validated.page?.name || page.name || "Facebook Page",
        accountUsername: validated.page?.name || page.name || "",
        accessToken: userToken,
        refreshToken: "",
        pageId: String(validated.page?.id || page.id),
        pageAccessToken,
        expiresAt,
        scopes: scopes.length ? scopes : FACEBOOK_OAUTH_SCOPES,
        metadata: {
          facebookUserId: profile.id,
          provider: "meta",
          category: validated.page?.category || "",
          link: validated.page?.link || "",
          pictureUrl: validated.page?.pictureUrl || "",
          validated: true
        }
      });
    }

    if (!accounts.length) {
      const err = new Error("Facebook Pages were found but none could be validated with a Page access token.");
      err.status = 400;
      throw err;
    }

    return accounts;
  },
  async refreshAccessToken({ accessToken, metadata }) {
    assertMetaConfigured();
    const longLived = await exchangeForLongLivedToken(accessToken);
    const expiresIn = Number(longLived.expires_in || 0);
    const userToken = longLived.access_token || accessToken;
    let pageAccessToken = "";
    try {
      const pages = await fetchFacebookPages(userToken);
      const pageId = metadata?.pageId || null;
      const match = pageId
        ? pages.find((p) => String(p.id) === String(pageId))
        : pages[0];
      pageAccessToken = match?.access_token || "";
    } catch {
      pageAccessToken = "";
    }
    return {
      accessToken: userToken,
      refreshToken: "",
      pageAccessToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
    };
  },
  async validateConnection({ pageAccessToken, accessToken, accountId }) {
    return validateFacebookConnection({
      pageId: accountId,
      pageAccessToken,
      userAccessToken: accessToken
    });
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
    const { userToken, expiresAt, profile, pages, grantedScopes } = await exchangeAndLoad(code);
    const withIg = pages.filter((p) => p.instagram_business_account?.id);
    if (!withIg.length) {
      const err = new Error(
        "No Instagram Professional account linked to your Facebook Pages. Convert to Business/Creator and link a Facebook Page, then retry."
      );
      err.status = 400;
      throw err;
    }

    const scopes = grantedScopes.filter((s) => INSTAGRAM_OAUTH_SCOPES.includes(s));
    const accounts = [];

    for (const page of withIg) {
      const ig = page.instagram_business_account;
      const pageAccessToken = page.access_token || "";
      if (!pageAccessToken) {
        continue;
      }

      let validated;
      try {
        validated = await fetchInstagramAccount(String(ig.id), pageAccessToken);
      } catch (err) {
        const wrapped = new Error(
          `Could not validate Instagram account @${ig.username || ig.id}: ${err.message}`
        );
        wrapped.status = 400;
        wrapped.details = err.details;
        throw wrapped;
      }

      accounts.push({
        accountId: String(validated.id || ig.id),
        accountName: validated.name || ig.name || validated.username || ig.username || "Instagram",
        accountUsername: validated.username || ig.username || "",
        accessToken: userToken,
        refreshToken: "",
        pageId: String(page.id),
        pageAccessToken,
        expiresAt,
        scopes: scopes.length ? scopes : INSTAGRAM_OAUTH_SCOPES,
        metadata: {
          facebookUserId: profile.id,
          pageName: page.name || "",
          provider: "meta",
          profilePictureUrl: validated.profile_picture_url || "",
          validated: true
        }
      });
    }

    if (!accounts.length) {
      const err = new Error(
        "Instagram accounts were found but none could be validated with a Page access token."
      );
      err.status = 400;
      throw err;
    }

    return accounts;
  },
  async refreshAccessToken({ accessToken, metadata }) {
    return facebookProvider.refreshAccessToken({ accessToken, metadata });
  },
  async validateConnection({ accessToken, pageAccessToken, accountId }) {
    return validateInstagramConnection({
      igUserId: accountId,
      pageAccessToken,
      userAccessToken: accessToken
    });
  }
};
