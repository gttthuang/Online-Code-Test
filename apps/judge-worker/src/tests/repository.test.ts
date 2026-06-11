import assert from "node:assert/strict";
import test from "node:test";

import type { CreateCustomRunResponse } from "@oct/contracts";

import {
  authHeader,
  createHarness,
  createSubmission,
  destroyHarness,
  fetchSubmission,
  login
} from "../../../api/src/tests/helpers.js";
import { PostgresJudgeRepository } from "../repository.js";

test("Postgres repository protects claims and execution leases", async () => {
  const harness = await createHarness({ seedExample: true });

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const submission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "print('placeholder')"
    });
    const customRunResponse = await harness.app.inject({
      method: "POST",
      url: "/me/custom-runs",
      headers: authHeader(candidate.token),
      payload: {
        problemId: "problem_reverse_string",
        language: "python",
        sourceCode: "print(input())",
        stdin: "hello"
      }
    });
    assert.equal(customRunResponse.statusCode, 200);
    const customRun = customRunResponse.json<CreateCustomRunResponse>();
    const repository = new PostgresJudgeRepository(harness.workerPool);

    assert.ok(
      (await repository.listQueuedSubmissionIds()).includes(submission.submissionId)
    );
    assert.ok(
      (await repository.listQueuedCustomRunIds()).includes(customRun.runId)
    );

    const [firstSubmissionClaim, duplicateSubmissionClaim] = await Promise.all([
      repository.claimSubmissionById(submission.submissionId),
      repository.claimSubmissionById(submission.submissionId)
    ]);
    const claimedSubmission = firstSubmissionClaim ?? duplicateSubmissionClaim;
    assert.ok(claimedSubmission);
    assert.equal(
      [firstSubmissionClaim, duplicateSubmissionClaim].filter(Boolean).length,
      1
    );

    const claimedRun = await repository.claimCustomRunById(customRun.runId);
    assert.ok(claimedRun);
    await repository.touchRunningSubmission(
      claimedSubmission.id,
      claimedSubmission.attemptId
    );
    await repository.touchRunningCustomRun(claimedRun.id, claimedRun.attemptId);

    await harness.adminPool.query(
      `
        update submissions
        set updated_at = now() - interval '1 minute'
        where id = $1
      `,
      [submission.submissionId]
    );
    await harness.adminPool.query(
      `
        update custom_runs
        set updated_at = now() - interval '1 minute'
        where id = $1
      `,
      [customRun.runId]
    );

    assert.deepEqual(
      await repository.recoverStaleSubmissions(5_000),
      [submission.submissionId]
    );
    assert.deepEqual(
      await repository.recoverStaleCustomRuns(5_000),
      [customRun.runId]
    );

    const replacementSubmission = await repository.claimSubmissionById(
      submission.submissionId
    );
    const replacementRun = await repository.claimCustomRunById(customRun.runId);
    assert.ok(replacementSubmission);
    assert.ok(replacementRun);
    assert.notEqual(
      replacementSubmission.attemptId,
      claimedSubmission.attemptId
    );
    assert.notEqual(replacementRun.attemptId, claimedRun.attemptId);

    const firstCase = replacementSubmission.hiddenTestCases[0];
    assert.ok(firstCase);
    assert.equal(
      await repository.completeSubmission(
        replacementSubmission.id,
        replacementSubmission.attemptId,
        {
          submissionId: replacementSubmission.id,
          status: "finished",
          score: 100,
          cases: [
            {
              testCaseId: firstCase.id,
              passed: true,
              executionTimeMs: 5,
              memoryKb: 1_024
            }
          ]
        }
      ),
      true
    );
    assert.equal(
      await repository.completeCustomRun(
        replacementRun.id,
        replacementRun.attemptId,
        {
          status: "finished",
          stdout: "hello\n",
          stderr: "",
          executionTimeMs: 5
        }
      ),
      true
    );

    assert.equal(
      await repository.completeSubmission(
        claimedSubmission.id,
        claimedSubmission.attemptId,
        {
          submissionId: claimedSubmission.id,
          status: "finished",
          score: 0,
          cases: []
        }
      ),
      false
    );
    assert.equal(
      await repository.completeCustomRun(
        claimedRun.id,
        claimedRun.attemptId,
        {
          status: "finished",
          stdout: "stale",
          stderr: "",
          executionTimeMs: 1
        }
      ),
      false
    );

    const detail = await fetchSubmission(
      harness.app,
      candidate.token,
      submission.submissionId
    );
    assert.equal(detail.status, "finished");
    assert.equal(detail.score, 100);
    assert.equal(detail.result?.cases.length, 1);
  } finally {
    await destroyHarness(harness);
  }
});
