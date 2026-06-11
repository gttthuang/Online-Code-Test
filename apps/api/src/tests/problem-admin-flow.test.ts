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
  const harness = await createHarness({ seedExample: true });

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const response = await harness.app.inject({
      method: "DELETE",
      url: "/admin/problems/problem_reverse_string",
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "problem_in_use");
    assert.equal(response.json().error.details.assignments > 0, true);
    assert.equal(response.json().error.details.canDeleteWithoutForce, false);
  } finally {
    await destroyHarness(harness);
  }
});

test("problem admin can inspect delete impact and force delete an in-use problem", async () => {
  const harness = await createHarness({ seedExample: true });

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");

    const impactResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/problems/problem_reverse_string/impact",
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(impactResponse.statusCode, 200);
    assert.equal(impactResponse.json().assignments > 0, true);

    const deleteResponse = await harness.app.inject({
      method: "DELETE",
      url: "/admin/problems/problem_reverse_string?force=true",
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(deleteResponse.statusCode, 204);

    const getResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/problems/problem_reverse_string",
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(getResponse.statusCode, 404);
  } finally {
    await destroyHarness(harness);
  }
});

test("problem admin can archive and restore problems", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const problem = await createProblem(harness.app, problemAdmin.token, {
      title: "Archive Me"
    });

    const archiveResponse = await harness.app.inject({
      method: "PATCH",
      url: `/admin/problems/${problem.id}/archive`,
      headers: authHeader(problemAdmin.token),
      payload: { archived: true }
    });

    assert.equal(archiveResponse.statusCode, 200);
    assert.ok(archiveResponse.json().problem.archivedAt);

    const restoreResponse = await harness.app.inject({
      method: "PATCH",
      url: `/admin/problems/${problem.id}/archive`,
      headers: authHeader(problemAdmin.token),
      payload: { archived: false }
    });

    assert.equal(restoreResponse.statusCode, 200);
    assert.equal(restoreResponse.json().problem.archivedAt, null);
  } finally {
    await destroyHarness(harness);
  }
});

test("problem admin can delete a problem after preview submissions", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const problem = await createProblem(harness.app, problemAdmin.token, {
      title: "Preview Delete"
    });

    const previewResponse = await harness.app.inject({
      method: "POST",
      url: "/admin/submissions/preview",
      headers: authHeader(problemAdmin.token),
      payload: {
        problemId: problem.id,
        language: "python",
        sourceCode: "print(input())"
      }
    });

    assert.equal(previewResponse.statusCode, 200);

    const deleteResponse = await harness.app.inject({
      method: "DELETE",
      url: `/admin/problems/${problem.id}`,
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(deleteResponse.statusCode, 204);

    const getResponse = await harness.app.inject({
      method: "GET",
      url: `/admin/problems/${problem.id}`,
      headers: authHeader(problemAdmin.token)
    });

    assert.equal(getResponse.statusCode, 404);
  } finally {
    await destroyHarness(harness);
  }
});
