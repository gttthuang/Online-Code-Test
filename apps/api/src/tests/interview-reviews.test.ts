import test from "node:test";
import assert from "node:assert/strict";

import type { CandidateReviewContextResponse, InterviewReview } from "@oct/contracts";

import { authHeader, createHarness, createProblem, destroyHarness, login } from "./helpers.js";

const reviewPayload = {
  notes: "Solved with clear communication and tested edge cases.",
  rubric: {
    problemSolving: 5,
    codeQuality: 4,
    communication: 5,
    testingDebugging: 4
  },
  recommendation: "hire"
} as const;

test("interviewer can create, update, list, and delete a private review", async () => {
  const harness = await createHarness({ seedExample: true });

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");

    const createResponse = await harness.app.inject({
      method: "PUT",
      url: "/admin/candidates/candidate_alice/reviews/problem_reverse_string",
      headers: authHeader(interviewer.token),
      payload: reviewPayload
    });

    assert.equal(createResponse.statusCode, 200);
    assert.equal(createResponse.json<{ review: InterviewReview }>().review.rubric.problemSolving, 5);

    const updateResponse = await harness.app.inject({
      method: "PUT",
      url: "/admin/candidates/candidate_alice/reviews/problem_reverse_string",
      headers: authHeader(interviewer.token),
      payload: {
        ...reviewPayload,
        notes: "Updated notes.",
        rubric: {
          ...reviewPayload.rubric,
          codeQuality: 5
        }
      }
    });

    assert.equal(updateResponse.statusCode, 200);
    assert.equal(updateResponse.json<{ review: InterviewReview }>().review.notes, "Updated notes.");
    assert.equal(updateResponse.json<{ review: InterviewReview }>().review.rubric.codeQuality, 5);

    const listResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/candidates/candidate_alice/reviews",
      headers: authHeader(interviewer.token)
    });

    assert.equal(listResponse.statusCode, 200);
    const context = listResponse.json<CandidateReviewContextResponse>();
    assert.ok(context.assignments.some((assignment) => assignment.problemId === "problem_reverse_string"));
    assert.ok(context.reviews.some((review) => review.problemId === "problem_reverse_string" && review.notes === "Updated notes."));

    const deleteResponse = await harness.app.inject({
      method: "DELETE",
      url: "/admin/candidates/candidate_alice/reviews/problem_reverse_string",
      headers: authHeader(interviewer.token)
    });

    assert.equal(deleteResponse.statusCode, 204);
  } finally {
    await destroyHarness(harness);
  }
});

test("review routes reject non-interviewer roles", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");

    const candidateResponse = await harness.app.inject({
      method: "GET",
      url: "/admin/candidates/candidate_alice/reviews",
      headers: authHeader(candidate.token)
    });

    assert.equal(candidateResponse.statusCode, 403);

    const adminResponse = await harness.app.inject({
      method: "PUT",
      url: "/admin/candidates/candidate_alice/reviews/problem_reverse_string",
      headers: authHeader(problemAdmin.token),
      payload: reviewPayload
    });

    assert.equal(adminResponse.statusCode, 403);
  } finally {
    await destroyHarness(harness);
  }
});

test("interviewer cannot review a problem that is not assigned to the candidate", async () => {
  const harness = await createHarness();

  try {
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const problemAdmin = await login(harness.app, "cindy.problem_admin@example.com");
    const unassignedProblem = await createProblem(harness.app, problemAdmin.token, {
      title: "Unassigned Review Target"
    });

    const response = await harness.app.inject({
      method: "PUT",
      url: `/admin/candidates/candidate_alice/reviews/${unassignedProblem.id}`,
      headers: authHeader(interviewer.token),
      payload: reviewPayload
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "review_problem_not_assigned");

    const unknownProblemResponse = await harness.app.inject({
      method: "PUT",
      url: "/admin/candidates/candidate_alice/reviews/problem_not_real",
      headers: authHeader(interviewer.token),
      payload: reviewPayload
    });

    assert.equal(unknownProblemResponse.statusCode, 404);
  } finally {
    await destroyHarness(harness);
  }
});
