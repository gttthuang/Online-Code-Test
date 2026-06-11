import test from "node:test";
import assert from "node:assert/strict";

import type { SubmissionHistoryItem } from "@oct/contracts";

import {
  authHeader,
  createHarness,
  createSubmission,
  createWorker,
  destroyHarness,
  login
} from "./helpers.js";

test("candidate submission history includes code snapshots and testcase results", async () => {
  const harness = await createHarness({ seedExample: true });

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const sourceCode = "print(input()[::-1])";
    const submission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode
    });

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processSubmissionById(submission.submissionId), true);

    const response = await harness.app.inject({
      method: "GET",
      url: "/me/submissions",
      headers: authHeader(candidate.token)
    });

    assert.equal(response.statusCode, 200);
    const history = response.json<SubmissionHistoryItem[]>();
    const item = history.find((entry) => entry.id === submission.submissionId);

    assert.ok(item);
    assert.equal(item.sourceCode, sourceCode);
    assert.equal(item.problemTitle, "Reverse String");
    assert.equal(item.passedCases, 1);
    assert.equal(item.totalCases, 1);
    assert.equal(item.result?.cases.length, 1);
  } finally {
    await destroyHarness(harness);
  }
});

test("interviewer can inspect candidate submission history but not admin preview runs", async () => {
  const harness = await createHarness({ seedExample: true });

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const candidateSubmission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "print(input()[::-1])"
    });

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processSubmissionById(candidateSubmission.submissionId), true);

    const listResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/candidates/candidate_alice/submissions",
      headers: authHeader(interviewer.token)
    });

    assert.equal(listResponse.statusCode, 200);
    const list = listResponse.json<{ submissions: SubmissionHistoryItem[] }>();
    assert.ok(list.submissions.some((item) => item.id === candidateSubmission.submissionId && item.sourceCode.includes("input()")));

    const previewResponse = await harness.app.inject({
      method: "POST",
      url: "/admin/submissions/preview",
      headers: authHeader(problemAdmin.token),
      payload: {
        problemId: "problem_reverse_string",
        language: "python",
        sourceCode: "print(input()[::-1])"
      }
    });

    assert.equal(previewResponse.statusCode, 200);
    const previewId = previewResponse.json<{ submissionId: string }>().submissionId;

    const forbiddenResponse = await harness.app.inject({
      method: "GET",
      url: `/admin/submissions/${previewId}`,
      headers: authHeader(interviewer.token)
    });

    assert.equal(forbiddenResponse.statusCode, 404);
  } finally {
    await destroyHarness(harness);
  }
});

test("problem admin can inspect all submission history", async () => {
  const harness = await createHarness({ seedExample: true });

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const submission = await createSubmission(harness.app, candidate.token, {
      problemId: "problem_reverse_string",
      language: "python",
      sourceCode: "print(input()[::-1])"
    });

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processSubmissionById(submission.submissionId), true);

    const listResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/submissions",
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(listResponse.statusCode, 200);
    const history = listResponse.json<SubmissionHistoryItem[]>();
    assert.ok(history.some((item) => item.id === submission.submissionId && item.candidateEmail === candidate.user.email));

    const detailResponse = await harness.app.inject({
      method: "GET",
      url: `/admin/submissions/${submission.submissionId}`,
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detailResponse.json<SubmissionHistoryItem>().sourceCode, "print(input()[::-1])");
  } finally {
    await destroyHarness(harness);
  }
});
