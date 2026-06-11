import test from "node:test";
import assert from "node:assert/strict";

import { createHarness, createSubmission, createWorker, destroyHarness, fetchSubmission, login } from "./helpers.js";

test("worker recovery re-queues stale running submissions", async () => {
  const harness = await createHarness({ seedExample: true });

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const submission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "print('placeholder')"
    });

    await harness.adminPool.query(
      `
        update submissions
        set
          status = 'running',
          updated_at = now() - interval '1 minute'
        where id = $1
      `,
      [submission.submissionId]
    );

    const worker = createWorker(harness.workerPool, {
      staleThresholdMs: 5_000
    });
    await worker.runRecoveryPass();

    const detail = await fetchSubmission(harness.app, candidate.token, submission.submissionId);
    assert.equal(detail.status, "queued");
    assert.equal(detail.score, null);
    assert.equal(detail.result, null);
  } finally {
    await destroyHarness(harness);
  }
});
