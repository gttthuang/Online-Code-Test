import test from "node:test";
import assert from "node:assert/strict";

import type {
  CandidateExamSummary,
  CandidateReviewContextResponse,
  CreateAssignmentResponse,
  CreateSubmissionResponse,
  InterviewReview,
  ProblemDetail,
  SubmissionDetail,
  SubmissionHistoryItem
} from "@oct/contracts";

import {
  authHeader,
  createCandidate,
  createHarness,
  createProblem,
  createWorker,
  destroyHarness,
  login
} from "../tests/helpers.js";
import type { InternalStats } from "../infra/store.js";

test("production journey from account creation to judged and reviewed submission", async () => {
  const harness = await createHarness();

  try {
    const admin = await login(harness.app, "cindy.problem_admin@example.com");
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const candidateRecord = await createCandidate(harness.app, interviewer.token, {
      name: "Production Flow Candidate"
    });
    const problem = await createProblem(harness.app, admin.token, {
      title: "Production Flow Echo",
      description: "<p>Echo all input exactly.</p>",
      constraints: "Input may contain multiple lines.",
      inputSpec: "UTF-8 text.",
      outputSpec: "The same UTF-8 text.",
      sampleExplanation: "The output preserves the input.",
      templateCode: "import sys\n",
      hiddenTestCases: [
        { input: "alpha", expectedOutput: "alpha" },
        { input: "line one\nline two\n", expectedOutput: "line one\nline two\n" }
      ]
    });

    const assignmentResponse = await harness.app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: authHeader(interviewer.token),
      payload: {
        candidateId: candidateRecord.id,
        problemIds: [problem.id],
        durationMinutes: 45
      }
    });

    assert.equal(assignmentResponse.statusCode, 200);
    const assignments = assignmentResponse.json<CreateAssignmentResponse>();
    assert.equal(assignments.assignments.length, 1);
    assert.equal(assignments.assignment.durationMinutes, 45);

    const candidate = await login(harness.app, candidateRecord.email);
    const lockedExamResponse = await harness.app.inject({
      method: "GET",
      url: "/me/exam",
      headers: authHeader(candidate.token)
    });

    assert.equal(lockedExamResponse.statusCode, 200);
    const lockedExam = lockedExamResponse.json<CandidateExamSummary>();
    assert.equal(lockedExam.status, "not_started");
    assert.equal(lockedExam.assignmentCount, 1);
    assert.deepEqual(lockedExam.assignments, []);

    const startResponse = await harness.app.inject({
      method: "POST",
      url: "/me/exam/start",
      headers: authHeader(candidate.token)
    });

    assert.equal(startResponse.statusCode, 200);
    const startedExam = startResponse.json<{ exam: CandidateExamSummary }>().exam;
    assert.equal(startedExam.status, "started");
    assert.equal(startedExam.assignments[0]?.problemId, problem.id);
    assert.ok((startedExam.remainingSeconds ?? 0) > 0);

    const problemResponse = await harness.app.inject({
      method: "GET",
      url: `/me/problems/${problem.id}`,
      headers: authHeader(candidate.token)
    });

    assert.equal(problemResponse.statusCode, 200);
    const candidateProblem = problemResponse.json<ProblemDetail>();
    assert.equal(candidateProblem.constraints, "Input may contain multiple lines.");
    assert.equal(candidateProblem.hiddenTestCases, undefined);

    const sourceCode = "import sys\nsys.stdout.write(sys.stdin.read())";
    const submissionResponse = await harness.app.inject({
      method: "POST",
      url: "/me/submissions",
      headers: authHeader(candidate.token),
      payload: {
        problemId: problem.id,
        language: "python",
        sourceCode
      }
    });

    assert.equal(submissionResponse.statusCode, 200);
    const submission = submissionResponse.json<CreateSubmissionResponse>();
    assert.equal(submission.status, "queued");

    const worker = createWorker(harness.workerPool);
    assert.equal(await worker.processSubmissionById(submission.submissionId), true);

    const detailResponse = await harness.app.inject({
      method: "GET",
      url: `/me/submissions/${submission.submissionId}`,
      headers: authHeader(candidate.token)
    });

    assert.equal(detailResponse.statusCode, 200);
    const detail = detailResponse.json<SubmissionDetail>();
    assert.equal(detail.status, "finished");
    assert.equal(detail.score, 100);
    assert.equal(detail.sourceCode, sourceCode);
    assert.equal(detail.result?.cases.length, 2);
    assert.ok(detail.result?.cases.every((judgeCase) => judgeCase.passed));

    const interviewerHistoryResponse = await harness.app.inject({
      method: "GET",
      url: `/admin/candidates/${candidateRecord.id}/submissions`,
      headers: authHeader(interviewer.token)
    });

    assert.equal(interviewerHistoryResponse.statusCode, 200);
    const interviewerHistory = interviewerHistoryResponse.json<{
      submissions: SubmissionHistoryItem[];
    }>();
    const historyItem = interviewerHistory.submissions.find((item) => item.id === submission.submissionId);
    assert.equal(historyItem?.sourceCode, sourceCode);
    assert.equal(historyItem?.passedCases, 2);
    assert.equal(historyItem?.totalCases, 2);

    const reviewResponse = await harness.app.inject({
      method: "PUT",
      url: `/admin/candidates/${candidateRecord.id}/reviews/${problem.id}`,
      headers: authHeader(interviewer.token),
      payload: {
        notes: "Correct solution with clear implementation.",
        rubric: {
          problemSolving: 5,
          codeQuality: 5,
          communication: 4,
          testingDebugging: 4
        },
        recommendation: "strong_hire"
      }
    });

    assert.equal(reviewResponse.statusCode, 200);
    assert.equal(reviewResponse.json<{ review: InterviewReview }>().review.recommendation, "strong_hire");

    const reviewContextResponse = await harness.app.inject({
      method: "GET",
      url: `/admin/candidates/${candidateRecord.id}/reviews`,
      headers: authHeader(interviewer.token)
    });

    assert.equal(reviewContextResponse.statusCode, 200);
    const reviewContext = reviewContextResponse.json<CandidateReviewContextResponse>();
    assert.equal(reviewContext.reviews[0]?.notes, "Correct solution with clear implementation.");

    const adminHistoryResponse = await harness.app.inject({
      method: "GET",
      url: `/admin/submissions?candidateId=${candidateRecord.id}&problemId=${problem.id}`,
      headers: authHeader(admin.token)
    });

    assert.equal(adminHistoryResponse.statusCode, 200);
    const adminHistory = adminHistoryResponse.json<SubmissionHistoryItem[]>();
    assert.equal(adminHistory.length, 1);
    assert.equal(adminHistory[0]?.id, submission.submissionId);

    const statsResponse = await harness.app.inject({
      method: "GET",
      url: "/internal/stats"
    });

    assert.equal(statsResponse.statusCode, 200);
    const stats = statsResponse.json<{ stats: InternalStats }>().stats;
    assert.equal(stats.totals.submissions, 1);
    assert.equal(stats.submissionsByStatus.finished, 1);
    assert.equal(stats.judgeCases.total, 2);
  } finally {
    await destroyHarness(harness);
  }
});
