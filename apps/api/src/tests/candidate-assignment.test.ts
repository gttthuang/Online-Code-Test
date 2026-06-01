import test from "node:test";
import assert from "node:assert/strict";

import {
  authHeader,
  createAssignment,
  createCandidate,
  createHarness,
  createProblem,
  destroyHarness,
  login
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
