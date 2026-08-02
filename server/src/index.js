import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { assertRuntimeSecrets, config } from "./config.js";
import authRoutes from "./routes/auth.js";
import oauthRoutes from "./routes/oauth.js";
import connectionsRoutes from "./routes/connections.js";
import postsRoutes from "./routes/posts.js";
import aiRoutes from "./routes/ai.js";

assertRuntimeSecrets();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "project-alpha",
    sprint: 1,
    metaConfigured: Boolean(config.meta.appId && config.meta.appSecret),
    openaiConfigured: Boolean(config.openai.apiKey)
  });
});

app.use("/api/auth", authRoutes);
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

app.listen(config.port, () => {
  console.log(`Project Alpha listening on ${config.appUrl} (port ${config.port})`);
});
