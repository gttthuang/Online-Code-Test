import "dotenv/config";

import { createPostgresPool } from "./postgres.js";
import { config } from "./config.js";
import { JudgeWorker } from "./worker.js";

const pool = createPostgresPool(config.postgres);
const worker = new JudgeWorker(pool, config.pollIntervalMs, config.sandbox);

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

console.log("judge-worker started");
console.log(`poll interval: ${config.pollIntervalMs}ms`);
console.log(
  `postgres: ${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`
);
console.log(
  `sandbox: python=${config.sandbox.pythonImage}, cpp=${config.sandbox.cppImage}, memory=${config.sandbox.memoryLimitMb}MB`
);

await worker.start();
