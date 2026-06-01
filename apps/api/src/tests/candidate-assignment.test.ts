import test from "node:test";
import assert from "node:assert/strict";

import {
  authHeader,
  createAssignment,
  createCandidate,
  createHarness,
  createProblem,
  destroyHarness,
  login,
  startCandidateExam
} from "./helpers.js";

test("interviewer can create candidates and duplicate email is rejected", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const candidate = await createCandidate(harness.app, interviewer.token, {
      name: "David Candidate",
      email: "david.candidate@example.com"
    });

    assert.equal(candidate.email, "david.candidate@example.com");

    const duplicateResponse = await harness.app.inject({
      method: "POST",
      url: "/admin/candidates",
      headers: authHeader(interviewer.token),
      payload: {
        name: "Duplicate Candidate",
        email: "david.candidate@example.com"
      }
    });

    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(duplicateResponse.json().error.code, "candidate_email_exists");
  } finally {
    await destroyHarness(harness);
  }
});

test("duplicate assignments are rejected", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const candidate = await createCandidate(harness.app, interviewer.token);

    await createAssignment(harness.app, interviewer.token, candidate.id, "problem_reverse_string");

    const duplicateResponse = await harness.app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: authHeader(interviewer.token),
      payload: {
        candidateId: candidate.id,
        problemId: "problem_reverse_string"
      }
    });

    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(duplicateResponse.json().error.code, "assignment_exists");
  } finally {
    await destroyHarness(harness);
  }
});

test("interviewer can assign multiple problems with a time limit", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const candidate = await createCandidate(harness.app, interviewer.token, {
      email: "multi.problem.candidate@example.com"
    });

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: authHeader(interviewer.token),
      payload: {
        candidateId: candidate.id,
        problemIds: ["problem_two_sum", "problem_reverse_string"],
        durationMinutes: 45
      }
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.assignments.length, 2);
    assert.equal(body.assignment.durationMinutes, 45);

    const candidateLogin = await login(harness.app, candidate.email);
    const examResponse = await harness.app.inject({
      method: "GET",
      url: "/me/exam",
      headers: authHeader(candidateLogin.token)
    });

    assert.equal(examResponse.statusCode, 200);
    assert.equal(examResponse.json().assignmentCount, 2);
    assert.equal(examResponse.json().durationMinutes, 45);
    assert.deepEqual(examResponse.json().assignments, []);
  } finally {
    await destroyHarness(harness);
  }
});

test("candidate sees only exam summary until starting", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const summaryResponse = await harness.app.inject({
      method: "GET",
      url: "/me/exam",
      headers: authHeader(candidate.token)
    });

    assert.equal(summaryResponse.statusCode, 200);
    assert.equal(summaryResponse.json().status, "not_started");
    assert.equal(summaryResponse.json().assignmentCount, 2);
    assert.equal(summaryResponse.json().durationMinutes, 60);
    assert.deepEqual(summaryResponse.json().assignments, []);

    const hiddenAssignmentsResponse = await harness.app.inject({
      method: "GET",
      url: "/me/assignments",
      headers: authHeader(candidate.token)
    });

    assert.equal(hiddenAssignmentsResponse.statusCode, 200);
    assert.deepEqual(hiddenAssignmentsResponse.json(), []);

    const blockedProblemResponse = await harness.app.inject({
      method: "GET",
      url: "/me/problems/problem_reverse_string",
      headers: authHeader(candidate.token)
    });

    assert.equal(blockedProblemResponse.statusCode, 403);
    assert.equal(blockedProblemResponse.json().error.code, "exam_not_started");

    const exam = await startCandidateExam(harness.app, candidate.token);
    assert.equal(exam.status, "started");
    assert.equal(exam.assignments.length, 2);
    assert.ok((exam.remainingSeconds ?? 0) > 0);

    const problemResponse = await harness.app.inject({
      method: "GET",
      url: "/me/problems/problem_reverse_string",
      headers: authHeader(candidate.token)
    });

    assert.equal(problemResponse.statusCode, 200);
  } finally {
    await destroyHarness(harness);
  }
});

test("assignments cannot change after a candidate starts", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const candidate = await createCandidate(harness.app, interviewer.token, {
      email: "started.exam.candidate@example.com"
    });

    await createAssignment(harness.app, interviewer.token, candidate.id, "problem_reverse_string");
    const candidateLogin = await login(harness.app, candidate.email);
    await startCandidateExam(harness.app, candidateLogin.token);

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: authHeader(interviewer.token),
      payload: {
        candidateId: candidate.id,
        problemId: "problem_two_sum"
      }
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, "exam_already_started");
  } finally {
    await destroyHarness(harness);
  }
});

test("archived problems cannot be assigned", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const candidate = await createCandidate(harness.app, interviewer.token);
    const problem = await createProblem(harness.app, problemAdmin.token, {
      title: "Archived Assignment"
    });

    const archiveResponse = await harness.app.inject({
      method: "PATCH",
      url: `/admin/problems/${problem.id}/archive`,
      headers: authHeader(problemAdmin.token),
      payload: { archived: true }
    });

    assert.equal(archiveResponse.statusCode, 200);

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: authHeader(interviewer.token),
      payload: {
        candidateId: candidate.id,
        problemId: problem.id
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "problem_archived");
  } finally {
    await destroyHarness(harness);
  }
});

test("in-use candidates cannot be deleted", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const response = await harness.app.inject({
      method: "DELETE",
      url: "/admin/candidates/candidate_alice",
      headers: authHeader(interviewer.token)
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "candidate_in_use");
  } finally {
    await destroyHarness(harness);
  }
});
