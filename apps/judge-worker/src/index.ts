import "dotenv/config";

import { Queue, Worker } from "bullmq";
import { judgeQueueName, type JudgeJob } from "@oct/contracts";

import { createPostgresPool } from "./postgres.js";
import { createRedisConnection } from "./redis.js";
import { config } from "./config.js";
import { logError, logInfo } from "./logger.js";
import { JudgeWorker } from "./worker.js";

const pool = createPostgresPool(config.postgres);
const worker = new JudgeWorker(
  pool,
  config.heartbeatIntervalMs,
  config.staleThresholdMs,
  config.sandbox
);
const redisConnection = createRedisConnection(config.redis);
const recoveryQueue = new Queue<JudgeJob>(judgeQueueName, {
  connection: redisConnection
});
const queueWorker = new Worker<JudgeJob>(
  judgeQueueName,
  async (job) => {
    await worker.processSubmissionById(job.data.submissionId);
  },
  {
    connection: redisConnection,
    concurrency: config.queueConcurrency
  }
);
const recoveryTimer = setInterval(() => {
  void recoverAndRequeue().catch((error) => {
    logError("worker_recovery_error", {
      message: error instanceof Error ? error.message : "judge worker recovery failed"
    });
  });
}, config.staleThresholdMs);

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearInterval(recoveryTimer);
  worker.stop();
  await queueWorker.close();
  await recoveryQueue.close();
  await redisConnection.quit();
  await pool.end();
}

async function enqueueSubmission(submissionId: string) {
  await recoveryQueue.add(
    "judge-submission",
    { submissionId },
    {
      jobId: submissionId,
      removeOnComplete: 500,
      removeOnFail: 500
    }
  );
}

async function syncQueuedSubmissions() {
  const queuedSubmissionIds = await worker.listQueuedSubmissionIds();

  for (const submissionId of queuedSubmissionIds) {
    await enqueueSubmission(submissionId);
  }

  if (queuedSubmissionIds.length > 0) {
    logInfo("queued_submissions_reenqueued", {
      count: queuedSubmissionIds.length
    });
  }
}

async function recoverAndRequeue() {
  const recoveredSubmissionIds = await worker.runRecoveryPass();

  for (const submissionId of recoveredSubmissionIds) {
    await enqueueSubmission(submissionId);
  }

  if (recoveredSubmissionIds.length > 0) {
    logInfo("recovered_submissions_reenqueued", {
      count: recoveredSubmissionIds.length
    });
  }
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

logInfo("worker_started", {
  heartbeatIntervalMs: config.heartbeatIntervalMs,
  staleThresholdMs: config.staleThresholdMs,
  queueMode: "redis-bullmq",
  queueName: judgeQueueName,
  queueConcurrency: config.queueConcurrency,
  postgres: `${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`,
  redis: `${config.redis.host}:${config.redis.port}/${config.redis.db}`,
  sandbox: {
    pythonImage: config.sandbox.pythonImage,
    cppImage: config.sandbox.cppImage,
    memoryLimitMb: config.sandbox.memoryLimitMb,
    cpuLimit: config.sandbox.cpuLimit,
    pidsLimit: config.sandbox.pidsLimit
  }
});

try {
  await recoverAndRequeue();
  await syncQueuedSubmissions();
} catch (error) {
  logError("worker_startup_error", {
    message: error instanceof Error ? error.message : "judge worker failed to start"
  });
  await shutdown();
  process.exit(1);
}
