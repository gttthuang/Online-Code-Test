import "dotenv/config";

import { createPostgresPool } from "./postgres.js";
import { config } from "./config.js";
import { logError, logInfo } from "./logger.js";
import { JudgeWorker } from "./worker.js";

const pool = createPostgresPool(config.postgres);
const worker = new JudgeWorker(
  pool,
  config.pollIntervalMs,
  config.heartbeatIntervalMs,
  config.staleThresholdMs,
  config.sandbox
);

process.on("SIGINT", async () => {
  worker.stop();
  await pool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  worker.stop();
  await pool.end();
  process.exit(0);
});

logInfo("worker_started", {
  pollIntervalMs: config.pollIntervalMs,
  heartbeatIntervalMs: config.heartbeatIntervalMs,
  staleThresholdMs: config.staleThresholdMs,
  postgres: `${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`,
  sandbox: {
    pythonImage: config.sandbox.pythonImage,
    cppImage: config.sandbox.cppImage,
    memoryLimitMb: config.sandbox.memoryLimitMb,
    cpuLimit: config.sandbox.cpuLimit,
    pidsLimit: config.sandbox.pidsLimit
  }
});

try {
  await worker.start();
} catch (error) {
  logError("worker_startup_error", {
    message: error instanceof Error ? error.message : "judge worker failed to start"
  });
  await pool.end();
  process.exit(1);
}
