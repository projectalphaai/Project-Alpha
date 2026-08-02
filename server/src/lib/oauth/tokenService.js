import { prisma } from "../prisma.js";
import { decryptSecret, encryptSecret } from "../crypto.js";
import { logActivity } from "../activity.js";
import { getProvider } from "./registry.js";

const EXPIRY_SKEW_MS = 2 * 60 * 1000;

export function isTokenExpired(expiresAt, skewMs = EXPIRY_SKEW_MS) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now() + skewMs;
}

export function serializeConnection(row, { includeSecrets = false } = {}) {
  const expired = isTokenExpired(row.tokenExpiresAt);
  const status = row.status === "revoked" ? "revoked" : expired ? "expired" : row.status || "active";
  const reconnectRequired = Boolean(row.reconnectRequired) || expired || status === "expired";

  const base = {
    id: row.id,
    platform: row.platform,
    accountId: row.accountId,
    accountName: row.accountName,
    accountUsername: row.accountUsername || "",
    pageId: row.pageId || "",
    scopes: row.scopes || "",
    status,
    reconnectRequired,
    tokenExpiresAt: row.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    lastRefreshedAt: row.lastRefreshedAt ? row.lastRefreshedAt.toISOString() : null,
    lastValidatedAt: row.lastValidatedAt ? row.lastValidatedAt.toISOString() : null,
    connectedAt: row.connectedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };

  if (includeSecrets) {
    // Never expose plaintext tokens via API — only encrypted presence flags for internals.
    base.hasAccessToken = Boolean(row.accessTokenEnc);
    base.hasRefreshToken = Boolean(row.refreshTokenEnc);
    base.hasPageToken = Boolean(row.pageAccessTokenEnc);
  }

  return base;
}

export async function upsertConnectedAccounts(userId, platform, accounts, { mode = "connect" } = {}) {
  const saved = [];
  for (const account of accounts) {
    const data = {
      accountName: account.accountName || PLATFORM_FALLBACK(platform),
      accountUsername: account.accountUsername || "",
      accessTokenEnc: encryptSecret(account.accessToken || ""),
      refreshTokenEnc: encryptSecret(account.refreshToken || ""),
      pageId: account.pageId || "",
      pageAccessTokenEnc: encryptSecret(account.pageAccessToken || ""),
      tokenExpiresAt: account.expiresAt || null,
      scopes: Array.isArray(account.scopes) ? account.scopes.join(",") : account.scopes || "",
      metadataJson: JSON.stringify(account.metadata || {}),
      status: "active",
      reconnectRequired: false,
      lastRefreshedAt: new Date(),
      lastValidatedAt: new Date()
    };

    const row = await prisma.connectedAccount.upsert({
      where: {
        userId_platform_accountId: {
          userId,
          platform,
          accountId: String(account.accountId)
        }
      },
      update: data,
      create: {
        userId,
        platform,
        accountId: String(account.accountId),
        ...data
      }
    });
    saved.push(row);
  }

  await logActivity({
    userId,
    type: mode === "reconnect" ? "oauth_reconnect" : "oauth_connect",
    message: `${mode === "reconnect" ? "Reconnected" : "Connected"} ${platform} (${saved.length} account${saved.length === 1 ? "" : "s"})`,
    meta: {
      platform,
      accountIds: saved.map((s) => s.accountId),
      mode
    }
  });

  return saved;
}

function PLATFORM_FALLBACK(platform) {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export async function markConnectionExpired(row, reason = "Token expired") {
  const updated = await prisma.connectedAccount.update({
    where: { id: row.id },
    data: {
      status: "expired",
      reconnectRequired: true
    }
  });
  await logActivity({
    userId: row.userId,
    type: "oauth_expire",
    message: `${row.platform} token expired for ${row.accountName || row.accountId}`,
    meta: { platform: row.platform, accountId: row.accountId, reason }
  });
  return updated;
}

export async function refreshConnectionTokens(row) {
  const provider = getProvider(row.platform);
  if (!provider) {
    const err = new Error(`No OAuth provider registered for ${row.platform}.`);
    err.status = 400;
    throw err;
  }
  if (!provider.isConfigured()) {
    const err = new Error(
      `${row.platform} OAuth credentials are not configured. Set the provider env vars to refresh tokens.`
    );
    err.status = 503;
    throw err;
  }

  if (isTokenExpired(row.tokenExpiresAt) === false && row.status === "active") {
    // Still allow explicit refresh if refresh token exists.
  }

  const refreshToken = row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : "";
  const accessToken = row.accessTokenEnc ? decryptSecret(row.accessTokenEnc) : "";

  if (!provider.refreshAccessToken) {
    const err = new Error(`${row.platform} does not support token refresh. Please reconnect.`);
    err.status = 409;
    throw err;
  }

  let refreshed;
  try {
    refreshed = await provider.refreshAccessToken({
      refreshToken,
      accessToken,
      metadata: safeJson(row.metadataJson)
    });
  } catch (err) {
    await markConnectionExpired(row, err.message || "Refresh failed");
    throw err;
  }

  const updated = await prisma.connectedAccount.update({
    where: { id: row.id },
    data: {
      accessTokenEnc: encryptSecret(refreshed.accessToken || accessToken),
      refreshTokenEnc: encryptSecret(refreshed.refreshToken || refreshToken),
      tokenExpiresAt: refreshed.expiresAt || row.tokenExpiresAt,
      status: "active",
      reconnectRequired: false,
      lastRefreshedAt: new Date(),
      lastValidatedAt: new Date()
    }
  });

  await logActivity({
    userId: row.userId,
    type: "oauth_refresh",
    message: `Refreshed ${row.platform} token for ${row.accountName || row.accountId}`,
    meta: { platform: row.platform, accountId: row.accountId }
  });

  return updated;
}

export async function syncExpiryFlagsForUser(userId) {
  const rows = await prisma.connectedAccount.findMany({ where: { userId } });
  for (const row of rows) {
    if (row.status === "revoked") continue;
    if (isTokenExpired(row.tokenExpiresAt) && (row.status !== "expired" || !row.reconnectRequired)) {
      await prisma.connectedAccount.update({
        where: { id: row.id },
        data: { status: "expired", reconnectRequired: true }
      });
    }
  }
}

function safeJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
