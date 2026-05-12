import test from "node:test";
import assert from "node:assert/strict";

import type { CandidateResultsResponse } from "@oct/contracts";

import {
  authHeader,
  createAssignment,
  createCandidate,
  createHarness,
  createProblem,
  createSubmission,
  createWorker,
  destroyHarness,
  fetchSubmission,
  login
} from "./helpers.js";

test("successful submission is judged and visible in interviewer results", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const candidateRecord = await createCandidate(harness.app, interviewer.token);
    const problem = await createProblem(harness.app, problemAdmin.token);
    await createAssignment(harness.app, interviewer.token, candidateRecord.id, problem.id);

    const candidate = await login(harness.app, candidateRecord.email);
    const submission = await createSubmission(harness.app, candidate.token, {
      problemId: problem.id,
      language: "python",
      sourceCode: "import sys\nprint(sys.stdin.read(), end='')"
    });

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processNextSubmission(), true);

    const detail = await fetchSubmission(harness.app, candidate.token, submission.submissionId);
    assert.equal(detail.status, "finished");
    assert.equal(detail.score, 100);
    assert.equal(detail.result?.cases.length, 2);

    const resultsResponse = await harness.app.inject({
      method: "GET",
      url: `/admin/candidates/${candidateRecord.id}/results`,
      headers: authHeader(interviewer.token)
    });

    assert.equal(resultsResponse.statusCode, 200);
    const results = resultsResponse.json<CandidateResultsResponse>();
    assert.ok(results.submissions.some((item) => item.submissionId === submission.submissionId && item.score === 100));
  } finally {
    await destroyHarness(harness);
  }
});

test("invalid code fails submissions", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const submission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "def broken(:\n    pass"
    });

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processNextSubmission(), true);

    const detail = await fetchSubmission(harness.app, candidate.token, submission.submissionId);
    assert.equal(detail.status, "failed");
    assert.equal(detail.score, 0);
    assert.match(detail.result?.errorMessage ?? "", /syntax|invalid/i);
  } finally {
    await destroyHarness(harness);
  }
});

test("wrong answers finish with zero score", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const submission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "print('not the answer')"
    });

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processNextSubmission(), true);

    const detail = await fetchSubmission(harness.app, candidate.token, submission.submissionId);
    assert.equal(detail.status, "finished");
    assert.equal(detail.score, 0);
    assert.ok(detail.result);
    assert.ok(detail.result.cases.every((judgeCase) => judgeCase.passed === false));
  } finally {
    await destroyHarness(harness);
  }
});

test("timeouts fail submissions", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const submission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "while True:\n    pass"
    });

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processNextSubmission(), true);

    const detail = await fetchSubmission(harness.app, candidate.token, submission.submissionId);
    assert.equal(detail.status, "failed");
    assert.equal(detail.score, 0);
    assert.match(detail.result?.errorMessage ?? "", /Time limit exceeded/i);
  } finally {
    await destroyHarness(harness);
  }
});
