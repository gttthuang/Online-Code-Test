import test from "node:test";
import assert from "node:assert/strict";

import { authHeader, createHarness, destroyHarness, login } from "./helpers.js";
import { problemValidation } from "../core/validation.js";

test("problem validation rejects empty hidden testcase lists", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/problems",
      headers: authHeader(problemAdmin.token),
      payload: {
        title: "Valid Title",
        description: "A valid enough problem description.",
        difficulty: "easy",
        timeLimitMs: 1000,
        memoryLimitKb: 65536,
        supportedLanguages: ["python"],
        sampleInput: "",
        sampleOutput: "",
        hiddenTestCases: []
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "validation_error");
  } finally {
    await destroyHarness(harness);
  }
});

test("problem validation rejects duplicate languages", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/problems",
      headers: authHeader(problemAdmin.token),
      payload: {
        title: "Another Valid Title",
        description: "Another valid enough problem description.",
        difficulty: "easy",
        timeLimitMs: 1000,
        memoryLimitKb: 65536,
        supportedLanguages: ["python", "python"],
        sampleInput: "",
        sampleOutput: "",
        hiddenTestCases: [{ input: "1", expectedOutput: "1" }]
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "validation_error");
  } finally {
    await destroyHarness(harness);
  }
});

test("problem validation rejects unrealistic resource limits", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/problems",
      headers: authHeader(problemAdmin.token),
      payload: {
        title: "Range Check",
        description: "Checking that unrealistic limits are rejected.",
        difficulty: "easy",
        timeLimitMs: problemValidation.timeLimitMs.max + 1,
        memoryLimitKb: problemValidation.memoryLimitKb.min - 1,
        supportedLanguages: ["python"],
        sampleInput: "",
        sampleOutput: "",
        hiddenTestCases: [{ input: "1", expectedOutput: "1" }]
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "validation_error");
  } finally {
    await destroyHarness(harness);
  }
});

test("problem validation rejects oversized testcase payloads", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/problems",
      headers: authHeader(problemAdmin.token),
      payload: {
        title: "Oversized Testcase",
        description: "This payload should be rejected by testcase size validation.",
        difficulty: "easy",
        timeLimitMs: 1000,
        memoryLimitKb: 65536,
        supportedLanguages: ["python"],
        sampleInput: "",
        sampleOutput: "",
        hiddenTestCases: [
          {
            input: "a".repeat(problemValidation.testCaseTextMaxChars + 1),
            expectedOutput: "ok"
          }
        ]
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "validation_error");
  } finally {
    await destroyHarness(harness);
  }
});

test("problem validation rejects oversized sample fields", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/problems",
      headers: authHeader(problemAdmin.token),
      payload: {
        title: "Oversized Sample",
        description: "This payload should be rejected by sample size validation.",
        difficulty: "easy",
        timeLimitMs: 1000,
        memoryLimitKb: 65536,
        supportedLanguages: ["python"],
        sampleInput: "a".repeat(problemValidation.sampleTextMaxChars + 1),
        sampleOutput: "",
        hiddenTestCases: [{ input: "1", expectedOutput: "1" }]
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "validation_error");
  } finally {
    await destroyHarness(harness);
  }
});

test("problem validation rejects too many hidden testcases", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/problems",
      headers: authHeader(problemAdmin.token),
      payload: {
        title: "Too Many Testcases",
        description: "This payload should be rejected by testcase count validation.",
        difficulty: "easy",
        timeLimitMs: 1000,
        memoryLimitKb: 65536,
        supportedLanguages: ["python"],
        sampleInput: "",
        sampleOutput: "",
        hiddenTestCases: Array.from(
          { length: problemValidation.hiddenTestCaseCount.max + 1 },
          (_, index) => ({ input: String(index), expectedOutput: String(index) })
        )
      }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "validation_error");
  } finally {
    await destroyHarness(harness);
  }
});

test("problem validation rejects invalid supportedLanguages JSON in multipart mode", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const formData = new FormData();
    formData.set("title", "Multipart Invalid Languages");
    formData.set("description", "This multipart request has malformed supportedLanguages JSON.");
    formData.set("difficulty", "easy");
    formData.set("timeLimitMs", "1000");
    formData.set("memoryLimitKb", "65536");
    formData.set("supportedLanguages", "not-json");
    formData.set("sampleInput", "");
    formData.set("sampleOutput", "");
    formData.set("testcases[0][input]", "1");
    formData.set("testcases[0][output]", "1");

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/problems",
      headers: authHeader(problemAdmin.token),
      payload: formData
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "invalid_supported_languages");
  } finally {
    await destroyHarness(harness);
  }
});
