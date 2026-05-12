import test from "node:test";
import assert from "node:assert/strict";

import {
  authHeader,
  createAssignment,
  createCandidate,
  createHarness,
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
