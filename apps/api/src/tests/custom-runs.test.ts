import test from "node:test";
import assert from "node:assert/strict";
import { getJudgeJobId } from "@oct/contracts";
import type { CreateCustomRunResponse, CustomRunDetail } from "@oct/contracts";

import { authHeader, createHarness, createWorker, destroyHarness, login } from "./helpers.js";

test("judge queue job ids are BullMQ-safe", () => {
  assert.equal(getJudgeJobId({ kind: "custom_run", runId: "run_123" }).includes(":"), false);
  assert.equal(getJudgeJobId({ kind: "submission", submissionId: "submission_123" }).includes(":"), false);
});

test("candidate can run custom stdin without creating a submission", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/me/custom-runs",
      headers: authHeader(candidate.token),
      payload: {
        problemId: "problem_reverse_string",
        language: "python",
        sourceCode: "import sys\nprint(sys.stdin.read()[::-1], end='')",
        stdin: "abc"
      }
    });

    assert.equal(response.statusCode, 200);

    const created = response.json<CreateCustomRunResponse>();
    const worker = createWorker(harness.workerPool);

    await worker.processCustomRunById(created.runId);

    const detailResponse = await harness.app.inject({
      method: "GET",
      url: `/me/custom-runs/${created.runId}`,
      headers: authHeader(candidate.token)
    });
    const detail = detailResponse.json<CustomRunDetail>();

    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detail.status, "finished");
    assert.equal(detail.stdout, "cba");
    assert.equal(detail.stderr, "");
    assert.equal(detail.errorType, null);
  } finally {
    await destroyHarness(harness);
  }
});

test("interviewer can run current room code for an assigned candidate", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/custom-runs",
      headers: authHeader(interviewer.token),
      payload: {
        candidateId: "candidate_alice",
        problemId: "problem_reverse_string",
        language: "python",
        sourceCode: "print(input().upper())",
        stdin: "hello\n"
      }
    });

    assert.equal(response.statusCode, 200);

    const created = response.json<CreateCustomRunResponse>();
    const worker = createWorker(harness.workerPool);

    await worker.processCustomRunById(created.runId);

    const detailResponse = await harness.app.inject({
      method: "GET",
      url: `/admin/custom-runs/${created.runId}`,
      headers: authHeader(interviewer.token)
    });
    const detail = detailResponse.json<CustomRunDetail>();

    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detail.status, "finished");
    assert.equal(detail.stdout, "HELLO\n");
  } finally {
    await destroyHarness(harness);
  }
});
