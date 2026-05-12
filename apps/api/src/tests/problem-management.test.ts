import test from "node:test";
import assert from "node:assert/strict";

import { authHeader, createHarness, createProblem, destroyHarness, login } from "./helpers.js";

test("problem admin can create and list problems", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const problem = await createProblem(harness.app, problemAdmin.token, {
      title: "List Me"
    });

    const listResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/problems",
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(listResponse.statusCode, 200);
    const problems = listResponse.json();
    assert.ok(problems.some((item: { id: string; title: string }) => item.id === problem.id && item.title === "List Me"));
  } finally {
    await destroyHarness(harness);
  }
});

test("in-use problems cannot be deleted", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const response = await harness.app.inject({
      method: "DELETE",
      url: "/admin/problems/problem_reverse_string",
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "problem_in_use");
  } finally {
    await destroyHarness(harness);
  }
});
