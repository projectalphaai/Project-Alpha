/**
 * Starts an embedded PostgreSQL instance for local Sprint 2 development/testing.
 * This is real PostgreSQL (not a mock). Prefer Docker Compose or a system install in production-like envs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const databaseDir = path.join(root, "tmp", "pg-data");
const port = Number(process.env.PG_LOCAL_PORT || 5432);
const password = process.env.PG_LOCAL_PASSWORD || "postgres";
const database = process.env.PG_LOCAL_DATABASE || "project_alpha";

fs.mkdirSync(path.dirname(databaseDir), { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password,
  port,
  persistent: true
});

const alreadyInitialized = fs.existsSync(path.join(databaseDir, "PG_VERSION"));

if (!alreadyInitialized) {
  console.log("Initializing embedded PostgreSQL...");
  await pg.initialise();
}

console.log(`Starting embedded PostgreSQL on port ${port}...`);
await pg.start();

try {
  await pg.createDatabase(database);
  console.log(`Created database ${database}`);
} catch (err) {
  if (!String(err?.message || err).toLowerCase().includes("already exists")) {
    console.warn("createDatabase:", err.message || err);
  } else {
    console.log(`Database ${database} already exists`);
  }
}

const url = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}?schema=public`;
console.log(`DATABASE_URL=${url}`);
console.log("Embedded PostgreSQL is running. Keep this process open while developing.");
console.log("Press Ctrl+C to stop.");

const stop = async () => {
  console.log("\nStopping embedded PostgreSQL...");
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);