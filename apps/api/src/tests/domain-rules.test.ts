import test from "node:test";
import assert from "node:assert/strict";

import {
  authHeader,
  createAssignment,
  createCandidate,
  createHarness,
  createProblem,
  createSubmission,
  destroyHarness,
  login,
  startCandidateExam
} from "./helpers.js";

test("assignment creation rejects nonexistent candidate", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: authHeader(interviewer.token),
      payload: {
        candidateId: "candidate_missing",
        problemId: "problem_reverse_string"
      }
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "candidate_not_found");
  } finally {
    await destroyHarness(harness);
  }
});

test("assignment creation rejects nonexistent problem", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: authHeader(interviewer.token),
      payload: {
        candidateId: "candidate_alice",
        problemId: "problem_missing"
      }
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "problem_not_found");
  } finally {
    await destroyHarness(harness);
  }
});

test("interviewer can delete an unused candidate", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const candidate = await createCandidate(harness.app, interviewer.token);

    const response = await harness.app.inject({
      method: "DELETE",
      url: `/admin/candidates/${candidate.id}`,
      headers: authHeader(interviewer.token)
    });

    assert.equal(response.statusCode, 204);
  } finally {
    await destroyHarness(harness);
  }
});

test("problem admin can delete an unused problem", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const problem = await createProblem(harness.app, problemAdmin.token);

    const response = await harness.app.inject({
      method: "DELETE",
      url: `/admin/problems/${problem.id}`,
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(response.statusCode, 204);
  } finally {
    await destroyHarness(harness);
  }
});

test("candidate cannot submit to an unassigned problem", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const problem = await createProblem(harness.app, problemAdmin.token);

    const response = await harness.app.inject({
      method: "POST",
      url: "/me/submissions",
      headers: authHeader(candidate.token),
      payload: {
        problemId: problem.id,
        language: "python",
        sourceCode: "print('hello')"
      }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "problem_not_assigned");
  } finally {
    await destroyHarness(harness);
  }
});

test("candidate cannot submit in a language the problem does not support", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const problem = await createProblem(harness.app, problemAdmin.token, {
      supportedLanguages: ["python"]
    });
    await createAssignment(harness.app, interviewer.token, "candidate_alice", problem.id);

    const candidate = await login(harness.app, "alice.candidate@example.com");
    await startCandidateExam(harness.app, candidate.token);
    const response = await harness.app.inject({
      method: "POST",
      url: "/me/submissions",
      headers: authHeader(candidate.token),
      payload: {
        problemId: problem.id,
        language: "cpp",
        sourceCode: "#include <iostream>\nint main(){std::cout << 1;}"
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "language_not_supported");
  } finally {
    await destroyHarness(harness);
  }
});

test("candidate cannot fetch another candidate's submission", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const secondCandidate = await createCandidate(harness.app, interviewer.token, {
      name: "Second Candidate",
      email: "second.candidate@example.com"
    });
    const problem = await createProblem(harness.app, problemAdmin.token);
    await createAssignment(harness.app, interviewer.token, secondCandidate.id, problem.id);

    const secondCandidateLogin = await login(harness.app, secondCandidate.email, secondCandidate.password);
    const submission = await createSubmission(harness.app, secondCandidateLogin.token, {
      problemId: problem.id,
      language: "python",
      sourceCode: "print('hello')"
    });

    const alice = await login(harness.app, "alice.candidate@example.com");
    const response = await harness.app.inject({
      method: "GET",
      url: `/me/submissions/${submission.submissionId}`,
      headers: authHeader(alice.token)
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "submission_not_found");
  } finally {
    await destroyHarness(harness);
  }
});
