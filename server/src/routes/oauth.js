import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { randomToken } from "../lib/crypto.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { getProvider, listProviders } from "../lib/oauth/registry.js";
import { isOAuthPlatform, PLATFORM_LABELS } from "../lib/oauth/platforms.js";
import { upsertConnectedAccounts } from "../lib/oauth/tokenService.js";
import { logActivity } from "../lib/activity.js";
import { createPkcePair } from "../lib/oauth/providers/x.js";

const router = Router();

function frontendRedirect({ oauth, platform = "", message = "" }) {
  const url = new URL("/pages/dashboard.html", config.appUrl);
  url.searchParams.set("oauth", oauth);
  if (platform) url.searchParams.set("platform", platform);
  if (message) url.searchParams.set("message", message);
  url.hash = "connect";
  return url.toString();
}

router.get("/providers", requireAuth, requireRole("member"), (_req, res) => {
  return res.json({ ok: true, providers: listProviders() });
});

async function startOAuth(req, res, next) {
  try {
    const platform = String(req.params.platform || req.body?.platform || "").toLowerCase();
    if (!isOAuthPlatform(platform)) {
      return res.status(400).json({ ok: false, error: "Unsupported OAuth platform." });
    }

    const provider = getProvider(platform);
    if (!provider) {
      return res.status(400).json({ ok: false, error: "OAuth provider not registered." });
    }
    if (!provider.isConfigured()) {
      return res.status(503).json({
        ok: false,
        error: `${PLATFORM_LABELS[platform]} OAuth credentials are not configured on the server. Add the provider env vars, then retry.`,
        platform,
        configured: false
      });
    }

    const mode = String(req.body?.mode || "connect").toLowerCase() === "reconnect" ? "reconnect" : "connect";
    const state = randomToken(24);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    let codeVerifier = "";
    let codeChallenge = "";

    if (provider.usesPkce) {
      const pkce = (provider.createPkcePair || createPkcePair)();
      codeVerifier = pkce.verifier;
      codeChallenge = pkce.challenge;
    }

    await prisma.oAuthState.create({
      data: {
        userId: req.user.id,
        platform,
        state,
        mode,
        codeVerifier,
        metaJson: JSON.stringify({
          accountId: req.body?.accountId || null,
          connectionId: req.body?.connectionId || null
        }),
        expiresAt
      }
    });

    await logActivity({
      userId: req.user.id,
      type: "oauth_start",
      message: `Started ${platform} OAuth (${mode})`,
      meta: { platform, mode }
    });

    const url = provider.getAuthorizeUrl({ state, codeChallenge });
    return res.json({ ok: true, url, platform, mode, configured: true });
  } catch (err) {
    next(err);
  }
}

async function handleCallback(req, res) {
  const platformParam = String(req.params.platform || "").toLowerCase();

  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      return res.redirect(
        frontendRedirect({
          oauth: "error",
          platform: platformParam,
          message: String(errorDescription || error)
        })
      );
    }
    if (!code || !state) {
      return res.redirect(
        frontendRedirect({
          oauth: "error",
          platform: platformParam,
          message: "Missing OAuth code or state."
        })
      );
    }

    const oauthState = await prisma.oAuthState.findUnique({ where: { state: String(state) } });
    if (!oauthState || oauthState.expiresAt < new Date()) {
      return res.redirect(
        frontendRedirect({
          oauth: "error",
          platform: platformParam,
          message: "OAuth session expired. Please try connecting again."
        })
      );
    }

    await prisma.oAuthState.delete({ where: { id: oauthState.id } }).catch(() => {});

    const platform = oauthState.platform;
    const provider = getProvider(platform);
    if (!provider || !provider.isConfigured()) {
      return res.redirect(
        frontendRedirect({
          oauth: "error",
          platform,
          message: "OAuth provider is not configured."
        })
      );
    }

    const accountsRaw = await provider.exchangeCode({
      code: String(code),
      codeVerifier: oauthState.codeVerifier || ""
    });

    let reconnectMeta = {};
    try {
      reconnectMeta = JSON.parse(oauthState.metaJson || "{}");
    } catch {
      reconnectMeta = {};
    }

    let accounts = accountsRaw;
    if (oauthState.mode === "reconnect" && reconnectMeta.accountId) {
      accounts = accountsRaw.filter((a) => String(a.accountId) === String(reconnectMeta.accountId));
      if (!accounts.length) {
        return res.redirect(
          frontendRedirect({
            oauth: "error",
            platform,
            message: `Reconnect failed: account ${reconnectMeta.accountId} was not returned by ${PLATFORM_LABELS[platform] || platform}. Check permissions and try again.`
          })
        );
      }
    }

    if (!accounts?.length) {
      return res.redirect(
        frontendRedirect({
          oauth: "error",
          platform,
          message: "No accounts returned from the provider."
        })
      );
    }

    await upsertConnectedAccounts(oauthState.userId, platform, accounts, {
      mode: oauthState.mode || "connect",
      targetAccountId: reconnectMeta.accountId || null,
      targetConnectionId: reconnectMeta.connectionId || null
    });

    return res.redirect(
      frontendRedirect({
        oauth: "success",
        platform,
        message: `Connected ${accounts.length} ${PLATFORM_LABELS[platform] || platform} account(s).`
      })
    );
  } catch (err) {
    console.error("OAuth callback failed:", err?.name || "Error", err?.status || "");
    return res.redirect(
      frontendRedirect({
        oauth: "error",
        platform: platformParam,
        message: err.message || "OAuth connection failed."
      })
    );
  }
}

// Backward-compatible Meta aliases (must be registered before /:platform/*)
router.post("/meta/start", requireAuth, requireRole("member"), (req, res, next) => {
  req.params.platform = String(req.body?.platform || "").toLowerCase();
  return startOAuth(req, res, next);
});
router.get("/meta/callback", (req, res) => {
  // Platform resolved from OAuthState; param is fallback for error redirects
  req.params.platform = "facebook";
  return handleCallback(req, res);
});

// Generic production routes
router.post("/:platform/start", requireAuth, requireRole("member"), startOAuth);
router.get("/:platform/callback", handleCallback);

export default router;
