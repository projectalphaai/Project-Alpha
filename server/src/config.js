import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requireEnv(name, { optional = false } = {}) {
  const value = (process.env[name] || "").trim();
  if (!value && !optional) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProd = nodeEnv === "production";
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export const config = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT || 3000),
  appUrl,
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "14d",
  tokenEncryptionKey: requireEnv("TOKEN_ENCRYPTION_KEY"),
  meta: {
    appId: requireEnv("META_APP_ID", { optional: !isProd }),
    appSecret: requireEnv("META_APP_SECRET", { optional: !isProd }),
    graphVersion: process.env.META_GRAPH_VERSION || "v22.0",
    // META_REDIRECT_URI is the canonical name; META_OAUTH_REDIRECT_URI is kept
    // as a backward-compatible alias for existing deployments.
    redirectUri:
      optionalEnv("META_REDIRECT_URI") ||
      optionalEnv("META_OAUTH_REDIRECT_URI") ||
      `${appUrl}/api/oauth/meta/callback`
  },
  google: {
    clientId: optionalEnv("GOOGLE_CLIENT_ID"),
    clientSecret: optionalEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri:
      optionalEnv("YOUTUBE_OAUTH_REDIRECT_URI") || `${appUrl}/api/oauth/youtube/callback`
  },
  linkedin: {
    clientId: optionalEnv("LINKEDIN_CLIENT_ID"),
    clientSecret: optionalEnv("LINKEDIN_CLIENT_SECRET"),
    redirectUri:
      optionalEnv("LINKEDIN_OAUTH_REDIRECT_URI") || `${appUrl}/api/oauth/linkedin/callback`
  },
  x: {
    clientId: optionalEnv("X_CLIENT_ID"),
    clientSecret: optionalEnv("X_CLIENT_SECRET"),
    redirectUri: optionalEnv("X_OAUTH_REDIRECT_URI") || `${appUrl}/api/oauth/x/callback`
  },
  openai: {
    // Never log or return this value. Optional in non-production so the API can boot without a key.
    apiKey: requireEnv("OPENAI_API_KEY", { optional: !isProd }),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    // Sprint 11 — AI Smart Scheduler image generation
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1"
  },
  scheduler: {
    // Sprint 11 — AI Smart Scheduler: minimum gap enforced between two posts
    // on the same platform ("never publish two posts together").
    minPostSpacingMinutes: Math.max(0, Number(process.env.MIN_POST_SPACING_MINUTES || 5)),
    uploadDir: optionalEnv("UPLOAD_DIR", "uploads"),
    publicUploadBaseUrl: optionalEnv("PUBLIC_UPLOAD_BASE_URL", "/uploads"),
    maxUploadSizeMb: Math.max(1, Number(process.env.MAX_UPLOAD_SIZE_MB || 100))
  },
  clipAi: {
    // Sprint 12 — Viral Clip AI: reuses the same uploads root as the Sprint 11
    // media pipeline (uploadDir above), under a "clips" subfolder.
    maxUploadSizeMb: Math.max(1, Number(process.env.CLIP_MAX_UPLOAD_SIZE_MB || 2048)),
    maxSourceDurationMin: Math.max(1, Number(process.env.CLIP_MAX_SOURCE_DURATION_MIN || 120)),
    whisperModel: optionalEnv("OPENAI_WHISPER_MODEL", "whisper-1"),
    // "heuristic-motion" ships today; a real face-detection model can be
    // registered under this same key later without changing call sites.
    faceTracker: optionalEnv("FACE_TRACKER", "heuristic-motion"),
    workerIntervalMs: Math.max(1000, Number(process.env.CLIP_WORKER_INTERVAL_MS || 5000))
  },
  cookieName: process.env.AUTH_COOKIE_NAME || "pa_session",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 14),
  stripe: {
    secretKey: optionalEnv("STRIPE_SECRET_KEY"),
    webhookSecret: optionalEnv("STRIPE_WEBHOOK_SECRET"),
    priceGenesis: optionalEnv("STRIPE_PRICE_GENESIS")
  },
  email: {
    resendApiKey: optionalEnv("RESEND_API_KEY"),
    from: optionalEnv("EMAIL_FROM", "Project Alpha <onboarding@resend.dev>")
  },
  billing: {
    // Default: enforce in production only. Override with BILLING_ENFORCE=true|false.
    enforce:
      optionalEnv("BILLING_ENFORCE") === "true" ||
      (optionalEnv("BILLING_ENFORCE") !== "false" && isProd),
    founderEmails: new Set(
      optionalEnv("FOUNDER_ADMIN_EMAILS")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
  }
};

export function assertRuntimeSecrets() {
  if (!config.databaseUrl.startsWith("postgresql://") && !config.databaseUrl.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string (postgresql://...).");
  }
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters.");
  }
  if (!config.tokenEncryptionKey || config.tokenEncryptionKey.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be at least 32 characters.");
  }
}

export function oauthProviderStatus() {
  return {
    instagram: Boolean(config.meta.appId && config.meta.appSecret),
    facebook: Boolean(config.meta.appId && config.meta.appSecret),
    youtube: Boolean(config.google.clientId && config.google.clientSecret),
    linkedin: Boolean(config.linkedin.clientId && config.linkedin.clientSecret),
    x: Boolean(config.x.clientId && config.x.clientSecret),
    // Architecture placeholders — see server/src/lib/oauth/providers/{tiktok,pinterest}.js
    tiktok: false,
    pinterest: false
  };
}
