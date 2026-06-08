import test from "node:test";
import assert from "node:assert/strict";

import {
  authHeader,
  createAssignment,
  createCandidate,
  createHarness,
  createProblem,
  createUser,
  destroyHarness,
  login
} from "./helpers.js";

test("interviewer can create, list, and delete users", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const user = await createUser(harness.app, interviewer.token, {
      name: "Dana Interviewer",
      email: "dana.interviewer@example.com",
      role: "interviewer"
    });

    const listResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/users",
      headers: authHeader(interviewer.token)
    });

    assert.equal(listResponse.statusCode, 200);
    assert.ok(listResponse.json().some((item: { id: string; role: string }) => item.id === user.id && item.role === "interviewer"));

    const deleteResponse = await harness.app.inject({
      method: "DELETE",
      url: `/admin/users/${user.id}`,
      headers: authHeader(interviewer.token)
    });

    assert.equal(deleteResponse.statusCode, 204);
  } finally {
    await destroyHarness(harness);
  }
});

test("candidate accounts are shared between user management and interviewer candidates", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const userManagedCandidate = await createUser(harness.app, interviewer.token, {
      name: "User Managed Candidate",
      email: "user.managed.candidate@example.com",
      role: "candidate"
    });

    const candidateListResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/candidates",
      headers: authHeader(interviewer.token)
    });

    assert.equal(candidateListResponse.statusCode, 200);
    assert.ok(candidateListResponse.json().some((item: { id: string; role: string }) =>
      item.id === userManagedCandidate.id && item.role === "candidate"
    ));

    const interviewerCreatedCandidate = await createCandidate(harness.app, interviewer.token, {
      name: "Interviewer Created Candidate",
      email: "interviewer.created.candidate@example.com"
    });

    const userListResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/users",
      headers: authHeader(interviewer.token)
    });

    assert.equal(userListResponse.statusCode, 200);
    assert.ok(userListResponse.json().some((item: { id: string; role: string }) =>
      item.id === interviewerCreatedCandidate.id && item.role === "candidate"
    ));
  } finally {
    await destroyHarness(harness);
  }
});

test("non interviewers cannot manage users", async () => {
  const harness = await createHarness();

  try {
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/users",
      headers: authHeader(problemAdmin.token),
      payload: {
        name: "Forbidden User",
        email: "forbidden@example.com",
        role: "candidate"
      }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "forbidden");
  } finally {
    await destroyHarness(harness);
  }
});

test("interviewer cannot delete self", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const response = await harness.app.inject({
      method: "DELETE",
      url: `/admin/users/${interviewer.user.id}`,
      headers: authHeader(interviewer.token)
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "user_self_delete_forbidden");
  } finally {
    await destroyHarness(harness);
  }
});

test("referenced users cannot be deleted", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const candidate = await createUser(harness.app, interviewer.token, {
      name: "Assigned Candidate",
      role: "candidate"
    });
    const problem = await createProblem(harness.app, problemAdmin.token, {
      title: "Assigned Problem"
    });
    await createAssignment(harness.app, interviewer.token, candidate.id, problem.id);

    const response = await harness.app.inject({
      method: "DELETE",
      url: `/admin/users/${candidate.id}`,
      headers: authHeader(interviewer.token)
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "user_in_use");
  } finally {
    await destroyHarness(harness);
  }
});
