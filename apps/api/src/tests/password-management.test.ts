import test from "node:test";
import assert from "node:assert/strict";

import { authHeader, createHarness, createUser, destroyHarness, login } from "./helpers.js";

test("a user can change their own password", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const change = await harness.app.inject({
      method: "POST",
      url: "/me/password",
      headers: authHeader(interviewer.token),
      payload: { currentPassword: "1234567890", newPassword: "brand-new-pass" }
    });
    assert.equal(change.statusCode, 204);

    // The new password works and the old one no longer does.
    const ok = await login(harness.app, "bob.interviewer@example.com", "brand-new-pass");
    assert.equal(ok.user.id, interviewer.user.id);

    const rejected = await harness.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "bob.interviewer@example.com", password: "1234567890" }
    });
    assert.equal(rejected.statusCode, 401);
  } finally {
    await destroyHarness(harness);
  }
});

test("change password rejects an incorrect current password", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/me/password",
      headers: authHeader(interviewer.token),
      payload: { currentPassword: "not-my-password", newPassword: "brand-new-pass" }
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "invalid_credentials");
  } finally {
    await destroyHarness(harness);
  }
});

test("change password rejects a too-short new password", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/me/password",
      headers: authHeader(interviewer.token),
      payload: { currentPassword: "1234567890", newPassword: "short" }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await destroyHarness(harness);
  }
});

test("an interviewer can reset another account's password", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const created = await createUser(harness.app, interviewer.token, {
      email: "reset.target@example.com",
      role: "problem_admin"
    });

    const reset = await harness.app.inject({
      method: "POST",
      url: `/admin/users/${created.id}/reset-password`,
      headers: authHeader(interviewer.token)
    });
    assert.equal(reset.statusCode, 200);
    const { password } = reset.json<{ password: string }>();
    assert.ok(password.length >= 8);

    // The regenerated password works; the original generated one no longer does.
    const ok = await login(harness.app, created.email, password);
    assert.equal(ok.user.id, created.id);

    const rejected = await harness.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: created.email, password: created.password }
    });
    assert.equal(rejected.statusCode, 401);
  } finally {
    await destroyHarness(harness);
  }
});

test("password reset is restricted to interviewers", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/users/interviewer_bob/reset-password",
      headers: authHeader(candidate.token)
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "forbidden");
  } finally {
    await destroyHarness(harness);
  }
});

test("password reset returns 404 for an unknown user", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const response = await harness.app.inject({
      method: "POST",
      url: "/admin/users/user_does_not_exist/reset-password",
      headers: authHeader(interviewer.token)
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "user_not_found");
  } finally {
    await destroyHarness(harness);
  }
});
