import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { encryptSecret, randomToken } from "../lib/crypto.js";
import {
  buildMetaOAuthUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchFacebookPages,
  fetchFacebookProfile
} from "../lib/meta.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const SUPPORTED = new Set(["instagram", "facebook"]);

router.post("/meta/start", requireAuth, async (req, res, next) => {
  try {
    const platform = String(req.body?.platform || "").toLowerCase();
    if (!SUPPORTED.has(platform)) {
      return res.status(400).json({
        ok: false,
        error: "Sprint 1 supports real OAuth for Instagram and Facebook only."
      });
    }

    const state = randomToken(24);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.oAuthState.create({
      data: {
        userId: req.user.id,
        platform,
        state,
        expiresAt
      }
    });

    const url = buildMetaOAuthUrl({ state, platform });
    return res.json({ ok: true, url });
  } catch (err) {
    next(err);
  }
});

router.get("/meta/callback", async (req, res) => {
  const frontendFail = (message) => {
    const url = new URL("/pages/dashboard.html", config.appUrl);
    url.hash = "connect";
    url.searchParams.set("oauth", "error");
    url.searchParams.set("message", message);
    return res.redirect(url.toString());
  };

  try {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
      return frontendFail(String(errorDescription || error));
    }
    if (!code || !state) {
      return frontendFail("Missing OAuth code or state.");
    }

    const oauthState = await prisma.oAuthState.findUnique({ where: { state: String(state) } });
    if (!oauthState || oauthState.expiresAt < new Date()) {
      return frontendFail("OAuth session expired. Please try connecting again.");
    }

    await prisma.oAuthState.delete({ where: { id: oauthState.id } }).catch(() => {});

    const shortLived = await exchangeCodeForToken(String(code));
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const userToken = longLived.access_token;
    const expiresIn = Number(longLived.expires_in || 0);
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    const profile = await fetchFacebookProfile(userToken);
    const pages = await fetchFacebookPages(userToken);

    if (oauthState.platform === "facebook") {
      if (!pages.length) {
        return frontendFail("No Facebook Pages found for this account. Create or grant access to a Page.");
      }

      const page = pages[0];
      await prisma.connectedAccount.upsert({
        where: {
          userId_platform_accountId: {
            userId: oauthState.userId,
            platform: "facebook",
            accountId: String(page.id)
          }
        },
        update: {
          accountName: page.name || "Facebook Page",
          accountUsername: page.name || "",
          accessTokenEnc: encryptSecret(userToken),
          pageId: String(page.id),
          pageAccessTokenEnc: encryptSecret(page.access_token || ""),
          tokenExpiresAt,
          scopes: "pages_show_list,pages_read_engagement,pages_manage_posts",
          metadataJson: JSON.stringify({ facebookUserId: profile.id }),
          updatedAt: new Date()
        },
        create: {
          userId: oauthState.userId,
          platform: "facebook",
          accountId: String(page.id),
          accountName: page.name || "Facebook Page",
          accountUsername: page.name || "",
          accessTokenEnc: encryptSecret(userToken),
          pageId: String(page.id),
          pageAccessTokenEnc: encryptSecret(page.access_token || ""),
          tokenExpiresAt,
          scopes: "pages_show_list,pages_read_engagement,pages_manage_posts",
          metadataJson: JSON.stringify({ facebookUserId: profile.id })
        }
      });
    } else {
      const withIg = pages.find((p) => p.instagram_business_account?.id);
      if (!withIg) {
        return frontendFail(
          "No Instagram Business account linked to your Facebook Pages. Connect an Instagram Professional account to a Page first."
        );
      }

      const ig = withIg.instagram_business_account;
      await prisma.connectedAccount.upsert({
        where: {
          userId_platform_accountId: {
            userId: oauthState.userId,
            platform: "instagram",
            accountId: String(ig.id)
          }
        },
        update: {
          accountName: ig.name || ig.username || "Instagram",
          accountUsername: ig.username || "",
          accessTokenEnc: encryptSecret(userToken),
          pageId: String(withIg.id),
          pageAccessTokenEnc: encryptSecret(withIg.access_token || ""),
          tokenExpiresAt,
          scopes:
            "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
          metadataJson: JSON.stringify({
            facebookUserId: profile.id,
            pageName: withIg.name || ""
          }),
          updatedAt: new Date()
        },
        create: {
          userId: oauthState.userId,
          platform: "instagram",
          accountId: String(ig.id),
          accountName: ig.name || ig.username || "Instagram",
          accountUsername: ig.username || "",
          accessTokenEnc: encryptSecret(userToken),
          pageId: String(withIg.id),
          pageAccessTokenEnc: encryptSecret(withIg.access_token || ""),
          tokenExpiresAt,
          scopes:
            "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
          metadataJson: JSON.stringify({
            facebookUserId: profile.id,
            pageName: withIg.name || ""
          })
        }
      });
    }

    const url = new URL("/pages/dashboard.html", config.appUrl);
    url.hash = "connect";
    url.searchParams.set("oauth", "success");
    url.searchParams.set("platform", oauthState.platform);
    return res.redirect(url.toString());
  } catch (err) {
    console.error("Meta OAuth callback failed:", err);
    return frontendFail(err.message || "OAuth connection failed.");
  }
});

export default router;
