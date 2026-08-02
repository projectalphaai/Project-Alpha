import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import authRoutes from "./routes/auth.js";
import oauthRoutes from "./routes/oauth.js";
import connectionsRoutes from "./routes/connections.js";
import postsRoutes from "./routes/posts.js";
import aiRoutes from "./routes/ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(
    cors({
      origin: config.appUrl,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use(
    "/api/",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false
    })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { ok: false, error: "Too many auth attempts. Try again later." }
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "project-alpha",
      sprint: 2,
      env: config.nodeEnv,
      database: "postgresql"
    });
  });

  app.get("/api/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({ ok: true, database: "up" });
    } catch (err) {
      console.error("Readiness check failed:", err);
      return res.status(503).json({ ok: false, database: "down" });
    }
  });

  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/oauth", oauthRoutes);
  app.use("/api/connections", connectionsRoutes);
  app.use("/api/posts", postsRoutes);
  app.use("/api/ai", aiRoutes);

  app.use(express.static(rootDir, { extensions: ["html"] }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    const status = err.status || 500;
    const expose = status < 500 || status === 503;
    res.status(status).json({
      ok: false,
      error: expose ? err.message || "Request failed." : "Internal server error."
    });
  });

  return app;
}
