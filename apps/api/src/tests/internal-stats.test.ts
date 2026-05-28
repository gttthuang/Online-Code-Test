import test from "node:test";
import assert from "node:assert/strict";

import {
  createHarness,
  createSubmission,
  createWorker,
  destroyHarness,
  fetchSubmission,
  login
} from "./helpers.js";

test("internal stats report submission statuses and failure breakdown", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");

    const successSubmission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "import sys\nprint(sys.stdin.read()[::-1], end='')"
    });
    const failedSubmission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "def broken(:\n    pass"
    });

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processSubmissionById(successSubmission.submissionId), true);
    assert.equal(await worker.processSubmissionById(failedSubmission.submissionId), true);

    const successDetail = await fetchSubmission(harness.app, candidate.token, successSubmission.submissionId);
    const failedDetail = await fetchSubmission(harness.app, candidate.token, failedSubmission.submissionId);
    assert.equal(successDetail.status, "finished");
    assert.equal(failedDetail.result?.errorType, "compile_error");

    const response = await harness.app.inject({
      method: "GET",
      url: "/internal/stats"
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      service: string;
      stats: {
        totals: {
          submissions: number;
        };
        submissionsByStatus: {
          finished: number;
          failed: number;
          queued: number;
          running: number;
        };
        failuresByType: {
          compile_error: number;
          runtime_error: number;
          time_limit_exceeded: number;
          sandbox_error: number;
          system_error: number;
        };
        judgeCases: {
          total: number;
          averageExecutionTimeMs: number | null;
        };
      };
    };

    assert.equal(body.service, "api");
    assert.equal(body.stats.totals.submissions, 2);
    assert.equal(body.stats.submissionsByStatus.finished, 1);
    assert.equal(body.stats.submissionsByStatus.failed, 1);
    assert.equal(body.stats.submissionsByStatus.queued, 0);
    assert.equal(body.stats.submissionsByStatus.running, 0);
    assert.equal(body.stats.failuresByType.compile_error, 1);
    assert.equal(body.stats.failuresByType.runtime_error, 0);
    assert.equal(body.stats.failuresByType.time_limit_exceeded, 0);
    assert.ok(body.stats.judgeCases.total >= 1);
    assert.notEqual(body.stats.judgeCases.averageExecutionTimeMs, null);
  } finally {
    await destroyHarness(harness);
  }
});
