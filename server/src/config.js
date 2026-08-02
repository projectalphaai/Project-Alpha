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

const nodeEnv = process.env.NODE_ENV || "development";
const isProd = nodeEnv === "production";

export const config = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT || 3000),
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "14d",
  tokenEncryptionKey: requireEnv("TOKEN_ENCRYPTION_KEY"),
  meta: {
    appId: requireEnv("META_APP_ID", { optional: !isProd }),
    appSecret: requireEnv("META_APP_SECRET", { optional: !isProd }),
    graphVersion: process.env.META_GRAPH_VERSION || "v21.0",
    redirectUri:
      process.env.META_OAUTH_REDIRECT_URI ||
      `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/oauth/meta/callback`
  },
  openai: {
    // Never log or return this value. Optional in non-production so the API can boot without a key.
    apiKey: requireEnv("OPENAI_API_KEY", { optional: !isProd }),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  },
  cookieName: process.env.AUTH_COOKIE_NAME || "pa_session",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 14)
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
