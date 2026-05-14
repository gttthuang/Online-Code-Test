import test from "node:test";
import assert from "node:assert/strict";

import { login } from "./helpers.js";
import { createHarness, destroyHarness } from "./helpers.js";
import { submissionValidation } from "../core/validation.js";

test("submission validation rejects oversized source code", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/me/submissions",
      headers: {
        authorization: `Bearer ${candidate.token}`
      },
      payload: {
        problemId: "problem_reverse_string",
        language: "python",
        sourceCode: "a".repeat(submissionValidation.sourceCodeMax + 1)
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "validation_error");
  } finally {
    await destroyHarness(harness);
  }
});

test("submission validation rejects blank source code", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/me/submissions",
      headers: {
        authorization: `Bearer ${candidate.token}`
      },
      payload: {
        problemId: "problem_reverse_string",
        language: "python",
        sourceCode: "   \n\t"
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "validation_error");
  } finally {
    await destroyHarness(harness);
  }
});
