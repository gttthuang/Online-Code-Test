import "dotenv/config";

import {
  judgeQueueName,
  type JudgeJob
} from "@oct/contracts";
import { Queue, Worker } from "bullmq";

import { config } from "./config.js";
import { logError, logInfo } from "./logger.js";
import { createPostgresPool } from "./postgres.js";
import { getRecoveryJobOptions } from "./recovery-queue.js";
import { PostgresJudgeRepository } from "./repository.js";
import { createRedisConnection } from "./redis.js";
import { JudgeWorker } from "./worker.js";

const pool = createPostgresPool(config.postgres);
const worker = new JudgeWorker(
  new PostgresJudgeRepository(pool),
  config.heartbeatIntervalMs,
  config.staleThresholdMs,
  config.sandbox
);
const redisConnection = createRedisConnection(config.redis);
const recoveryQueue = new Queue<JudgeJob>(judgeQueueName, {
  connection: redisConnection as never
});
const queueWorker = new Worker<JudgeJob>(
  judgeQueueName,
  async (job) => {
    const processed =
      job.data.kind === "custom_run"
        ? await worker.processCustomRunById(job.data.runId)
        : await worker.processSubmissionById(job.data.submissionId);

    if (!processed) {
      logInfo("judge_job_skipped", {
        jobId: job.id,
        kind: job.data.kind ?? "submission"
      });
    }
  },
  {
    connection: redisConnection as never,
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
  await queueWorker.close();
  await recoveryQueue.close();
  await redisConnection.quit();
  await pool.end();
}

async function enqueueSubmission(submissionId: string) {
  await enqueueRecoveryJob({ kind: "submission", submissionId });
}

async function enqueueCustomRun(runId: string) {
  await enqueueRecoveryJob({ kind: "custom_run", runId });
}

async function enqueueRecoveryJob(job: JudgeJob) {
  await recoveryQueue.add("judge-submission", job, getRecoveryJobOptions(job));
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

async function syncQueuedCustomRuns() {
  const queuedRunIds = await worker.listQueuedCustomRunIds();

  for (const runId of queuedRunIds) {
    await enqueueCustomRun(runId);
  }

  if (queuedRunIds.length > 0) {
    logInfo("queued_custom_runs_reenqueued", {
      count: queuedRunIds.length
    });
  }
}

async function recoverAndRequeue() {
  const recovered = await worker.runRecoveryPass();

  for (const submissionId of recovered.submissionIds) {
    await enqueueSubmission(submissionId);
  }

  for (const runId of recovered.customRunIds) {
    await enqueueCustomRun(runId);
  }

  if (recovered.submissionIds.length > 0) {
    logInfo("recovered_submissions_reenqueued", {
      count: recovered.submissionIds.length
    });
  }

  if (recovered.customRunIds.length > 0) {
    logInfo("recovered_custom_runs_reenqueued", {
      count: recovered.customRunIds.length
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
  await syncQueuedCustomRuns();
} catch (error) {
  logError("worker_startup_error", {
    message: error instanceof Error ? error.message : "judge worker failed to start"
  });
  await shutdown();
  process.exit(1);
}
