import assert from "node:assert/strict";
import test from "node:test";

import type { JudgeJob } from "@oct/contracts";
import type { Queue } from "bullmq";

import { RedisJudgeQueue } from "../infra/judge-queue.js";

test("API enqueue is idempotent and carries the retry policy", async () => {
  type CapturedOptions = {
    jobId?: string;
    attempts?: number;
    backoff?: unknown;
  };
  let captured:
    | {
        name: string;
        job: JudgeJob;
        options: CapturedOptions;
      }
    | undefined;
  const queue = {
    async add(name: string, job: JudgeJob, options: CapturedOptions) {
      captured = { name, job, options };
    },
    async close() {}
  } as unknown as Queue<JudgeJob>;
  const judgeQueue = new RedisJudgeQueue(queue);
  const job: JudgeJob = {
    kind: "custom_run",
    runId: "run-1"
  };

  await judgeQueue.enqueue(job);

  assert.ok(captured);
  assert.equal(captured.name, "judge-submission");
  assert.deepEqual(captured.job, job);
  assert.equal(captured.options.jobId, "custom-run-run-1");
  assert.equal(captured.options.attempts, 3);
  assert.deepEqual(captured.options.backoff, {
    type: "exponential",
    delay: 1_000
  });
});
