import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { OAUTH_PLATFORMS, PLATFORM_LABELS, isOAuthPlatform } from "../lib/oauth/platforms.js";
import { listProviders } from "../lib/oauth/registry.js";
import {
  refreshConnectionTokens,
  serializeConnection,
  syncExpiryFlagsForUser
} from "../lib/oauth/tokenService.js";
import { getProvider } from "../lib/oauth/registry.js";
import { decryptSecret } from "../lib/crypto.js";
import { logActivity } from "../lib/activity.js";
import { friendlyConnectionError } from "../lib/friendlyErrors.js";

const router = Router();

router.get("/health", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    await syncExpiryFlagsForUser(req.user.id);
    const rows = await prisma.connectedAccount.findMany({
      where: { userId: req.user.id },
      orderBy: [{ platform: "asc" }, { connectedAt: "desc" }]
    });

    const results = [];
    for (const row of rows) {
      const base = serializeConnection(row, { includeSecrets: true });
      const provider = getProvider(row.platform);
      let health = {
        status: base.status,
        healthy: base.status === "active" && !base.reconnectRequired,
        checkedAt: new Date().toISOString(),
        message: base.reconnectRequired ? "Reconnect required." : "Stored connection looks active."
      };

      if (provider?.validateConnection && provider.isConfigured() && !base.reconnectRequired) {
        try {
          const accessToken = row.accessTokenEnc ? decryptSecret(row.accessTokenEnc) : "";
          const pageAccessToken = row.pageAccessTokenEnc ? decryptSecret(row.pageAccessTokenEnc) : "";
          await provider.validateConnection({
            accessToken,
            pageAccessToken,
            accountId: row.accountId
          });
          await prisma.connectedAccount.update({
            where: { id: row.id },
            data: { lastValidatedAt: new Date(), status: "active", reconnectRequired: false }
          });
          health = {
            status: "active",
            healthy: true,
            checkedAt: new Date().toISOString(),
            message: "Live Graph validation passed."
          };
        } catch (err) {
          await prisma.connectedAccount.update({
            where: { id: row.id },
            data: { status: "expired", reconnectRequired: true }
          });
          health = {
            status: "expired",
            healthy: false,
            checkedAt: new Date().toISOString(),
            message: friendlyConnectionError(err.message)
          };
        }
      } else if (!provider?.validateConnection) {
        health.message = "Live validation not available for this platform; using stored status.";
      }

      results.push({
        ...base,
        health
      });
    }

    const healthyCount = results.filter((r) => r.health.healthy).length;
    return res.json({
      ok: true,
      summary: {
        total: results.length,
        healthy: healthyCount,
        unhealthy: results.length - healthyCount
      },
      connections: results
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    await syncExpiryFlagsForUser(req.user.id);

    const rows = await prisma.connectedAccount.findMany({
      where: { userId: req.user.id },
      orderBy: [{ platform: "asc" }, { connectedAt: "desc" }]
    });

    const accounts = rows.map((row) => serializeConnection(row, { includeSecrets: true }));
    const providers = listProviders();

    const byPlatform = {};
    for (const platform of OAUTH_PLATFORMS) {
      const provider = providers.find((p) => p.id === platform);
      const platformAccounts = accounts.filter((a) => a.platform === platform);
      const primary = platformAccounts[0] || null;
      byPlatform[platform] = {
        platform,
        label: PLATFORM_LABELS[platform],
        supported: true,
        configured: Boolean(provider?.configured),
        connected: platformAccounts.length > 0,
        accountCount: platformAccounts.length,
        accounts: platformAccounts,
        // Convenience fields for single-card UI (primary / first account)
        id: primary?.id || null,
        accountId: primary?.accountId || null,
        accountName: primary?.accountName || null,
        accountUsername: primary?.accountUsername || null,
        status: primary?.status || null,
        reconnectRequired: primary?.reconnectRequired || false,
        tokenExpiresAt: primary?.tokenExpiresAt || null,
        connectedAt: primary?.connectedAt || null
      };
    }

    return res.json({
      ok: true,
      connections: byPlatform,
      accounts,
      providers,
      connectedCount: accounts.length
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/refresh", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const row = await prisma.connectedAccount.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!row) {
      return res.status(404).json({ ok: false, error: "Connection not found." });
    }

    const updated = await refreshConnectionTokens(row);
    return res.json({
      ok: true,
      connection: serializeConnection(updated, { includeSecrets: true })
    });
  } catch (err) {
    const status = err.status || 502;
    return res.status(status).json({
      ok: false,
      error: err.message || "Token refresh failed."
    });
  }
});

/** Validate tokens still work against the provider Graph API (Instagram/Meta). */
router.post("/:id/validate", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const row = await prisma.connectedAccount.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!row) {
      return res.status(404).json({ ok: false, error: "Connection not found." });
    }

    const provider = getProvider(row.platform);
    if (!provider?.validateConnection) {
      return res.status(409).json({
        ok: false,
        error: `${row.platform} does not support live token validation yet.`
      });
    }
    if (!provider.isConfigured()) {
      return res.status(503).json({
        ok: false,
        error: `${row.platform} OAuth credentials are not configured.`
      });
    }

    const accessToken = row.accessTokenEnc ? decryptSecret(row.accessTokenEnc) : "";
    const pageAccessToken = row.pageAccessTokenEnc ? decryptSecret(row.pageAccessTokenEnc) : "";

    const result = await provider.validateConnection({
      accessToken,
      pageAccessToken,
      accountId: row.accountId,
      metadata: (() => {
        try {
          return JSON.parse(row.metadataJson || "{}");
        } catch {
          return {};
        }
      })()
    });

    const updated = await prisma.connectedAccount.update({
      where: { id: row.id },
      data: {
        lastValidatedAt: new Date(),
        status: "active",
        reconnectRequired: false,
        accountUsername:
          result.account?.username || result.page?.name || row.accountUsername,
        accountName: result.account?.name || result.page?.name || row.accountName
      }
    });

    await logActivity({
      userId: req.user.id,
      type: "oauth_validate",
      message: `Validated ${row.platform} connection ${row.accountName || row.accountId}`,
      meta: { platform: row.platform, accountId: row.accountId, connectionId: row.id }
    });

    return res.json({
      ok: true,
      validation: result,
      connection: serializeConnection(updated, { includeSecrets: true })
    });
  } catch (err) {
    try {
      const row = await prisma.connectedAccount.findFirst({
        where: { id: req.params.id, userId: req.user.id }
      });
      if (row) {
        await prisma.connectedAccount.update({
          where: { id: row.id },
          data: { status: "expired", reconnectRequired: true }
        });
      }
    } catch {
      /* ignore */
    }
    const status = err.status || 502;
    return res.status(status).json({
      ok: false,
      error: err.message || "Connection validation failed.",
      reconnectRequired: true
    });
  }
});

router.post("/:id/reconnect", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const row = await prisma.connectedAccount.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!row) {
      return res.status(404).json({ ok: false, error: "Connection not found." });
    }

    // Client should call /api/oauth/:platform/start with mode=reconnect.
    // This endpoint documents the reconnect contract and audits intent.
    await logActivity({
      userId: req.user.id,
      type: "oauth_reconnect_intent",
      message: `Reconnect requested for ${row.platform} (${row.accountName || row.accountId})`,
      meta: { platform: row.platform, connectionId: row.id, accountId: row.accountId }
    });

    return res.json({
      ok: true,
      platform: row.platform,
      connectionId: row.id,
      startPath: `/api/oauth/${row.platform}/start`,
      body: { mode: "reconnect", connectionId: row.id, accountId: row.accountId }
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/account/:id", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const row = await prisma.connectedAccount.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!row) {
      return res.status(404).json({ ok: false, error: "Connection not found." });
    }

    await prisma.connectedAccount.delete({ where: { id: row.id } });
    await logActivity({
      userId: req.user.id,
      type: "oauth_disconnect",
      message: `Disconnected ${row.platform} account ${row.accountName || row.accountId}`,
      meta: { platform: row.platform, accountId: row.accountId, connectionId: row.id }
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Disconnect all accounts for a platform (legacy + bulk). */
router.delete("/:platform", requireAuth, requireRole("member"), async (req, res, next) => {
  try {
    const platform = String(req.params.platform || "").toLowerCase();
    if (!isOAuthPlatform(platform)) {
      return res.status(400).json({ ok: false, error: "Unsupported platform." });
    }

    const result = await prisma.connectedAccount.deleteMany({
      where: { userId: req.user.id, platform }
    });

    await logActivity({
      userId: req.user.id,
      type: "oauth_disconnect",
      message: `Disconnected all ${platform} accounts (${result.count})`,
      meta: { platform, count: result.count }
    });

    return res.json({ ok: true, deleted: result.count });
  } catch (err) {
    next(err);
  }
});

export default router;
