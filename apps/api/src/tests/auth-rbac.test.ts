import test from "node:test";
import assert from "node:assert/strict";

import { authHeader, createCandidate, createHarness, destroyHarness, login } from "./helpers.js";

test("login rejects an incorrect password", async () => {
  const harness = await createHarness();

  try {
    const response = await harness.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "bob.interviewer@example.com", password: "wrong-password" }
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "invalid_credentials");
  } finally {
    await destroyHarness(harness);
  }
});

test("login rejects an unknown email", async () => {
  const harness = await createHarness();

  try {
    const response = await harness.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "1234567890" }
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "invalid_credentials");
  } finally {
    await destroyHarness(harness);
  }
});

test("a newly created account signs in with its generated password and not the default", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const candidate = await createCandidate(harness.app, interviewer.token, {
      email: "generated.password@example.com"
    });

    // The generated password is returned once and works.
    const ok = await login(harness.app, candidate.email, candidate.password);
    assert.equal(ok.user.id, candidate.id);

    // The shared default password must not unlock a freshly created account.
    const rejected = await harness.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: candidate.email, password: "1234567890" }
    });
    assert.equal(rejected.statusCode, 401);
  } finally {
    await destroyHarness(harness);
  }
});

test("missing bearer token returns unauthorized", async () => {
  const harness = await createHarness();

  try {
    const response = await harness.app.inject({
      method: "GET",
      url: "/me/assignments"
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "unauthorized");
  } finally {
    await destroyHarness(harness);
  }
});

test("candidate cannot call interviewer candidate management endpoint", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");

    const response = await harness.app.inject({
      method: "GET",
      url: "/admin/candidates",
      headers: authHeader(candidate.token)
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "forbidden");
  } finally {
    await destroyHarness(harness);
  }
});

test("interviewer cannot create problems", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/problems",
      headers: authHeader(interviewer.token),
      payload: {
        title: "Forbidden Problem",
        description: "Should not work.",
        difficulty: "easy",
        timeLimitMs: 1000,
        memoryLimitKb: 65536,
        supportedLanguages: ["python"],
        sampleInput: "x",
        sampleOutput: "x",
        hiddenTestCases: [{ input: "x", expectedOutput: "x" }]
      }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "forbidden");
  } finally {
    await destroyHarness(harness);
  }
});

test("problem admin cannot create assignments", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/assignments",
      headers: authHeader(problemAdmin.token),
      payload: {
        candidateId: "candidate_alice",
        problemId: "problem_reverse_string"
      }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "forbidden");
  } finally {
    await destroyHarness(harness);
  }
});
