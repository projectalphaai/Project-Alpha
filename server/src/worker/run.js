/**
 * Standalone publish worker entrypoint:
 *   npm run worker
 */
import { assertRuntimeSecrets } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { startPublisherWorker, stopPublisherWorker } from "./publisherWorker.js";

assertRuntimeSecrets();

async function main() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Worker failed to connect to PostgreSQL:", err.message);
    process.exit(1);
  }

  startPublisherWorker();
  console.log("Standalone publish worker running. Press Ctrl+C to stop.");
}

main();

async function shutdown(signal) {
  console.log(`${signal} received, stopping worker...`);
  stopPublisherWorker();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
