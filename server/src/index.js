import { assertRuntimeSecrets, config } from "./config.js";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { startPublisherWorker, stopPublisherWorker } from "./worker/publisherWorker.js";

assertRuntimeSecrets();

const app = createApp();
let workerHandle = null;

async function start() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Failed to connect to PostgreSQL:", err.message);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`Project Alpha API listening on ${config.appUrl} (port ${config.port})`);
    console.log(`Database: PostgreSQL | Sprint: 4`);
    workerHandle = startPublisherWorker();
  });
}

start();

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  try {
    stopPublisherWorker();
    workerHandle = null;
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
