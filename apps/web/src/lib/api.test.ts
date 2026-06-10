import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "./api";

type FetchArgs = [string, RequestInit | undefined];

function lastCall(): FetchArgs {
  const mock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  return mock.mock.calls.at(-1) as FetchArgs;
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function mockResponse(
  body: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}
) {
  const text = body === null || body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return { ok, status, text: async () => text } as Response;
}

function stubFetch(body: unknown, opts?: { ok?: boolean; status?: number }) {
  const fn = vi.fn(async () => mockResponse(body, opts));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request core behaviour", () => {
  it("issues a GET without auth or content-type and returns parsed JSON", async () => {
    stubFetch({ status: "ok", service: "api" });

    const result = await api.getHealth();

    expect(result).toEqual({ status: "ok", service: "api" });
    const [url, init] = lastCall();
    expect(url).toBe("/healthz");
    expect(headerValue(init, "Authorization")).toBeNull();
    expect(headerValue(init, "Content-Type")).toBeNull();
  });

  it("sets JSON content-type for a body and attaches a bearer token", async () => {
    stubFetch({ ok: true });

    await api.createSubmission("tok-123", {
      problemId: "p1",
      language: "python",
      code: "print(1)"
    } as never);

    const [url, init] = lastCall();
    expect(url).toBe("/me/submissions");
    expect(init?.method).toBe("POST");
    expect(headerValue(init, "Content-Type")).toBe("application/json");
    expect(headerValue(init, "Authorization")).toBe("Bearer tok-123");
    expect(init?.body).toBe(JSON.stringify({ problemId: "p1", language: "python", code: "print(1)" }));
  });

  it("does not force a content-type when the body is FormData", async () => {
    stubFetch({ problem: { id: "p1" } });

    const form = new FormData();
    form.append("title", "Reverse a string");
    await api.createProblem("tok", form);

    const [url, init] = lastCall();
    expect(url).toBe("/admin/problems");
    expect(init?.method).toBe("POST");
    expect(headerValue(init, "Content-Type")).toBeNull();
    expect(init?.body).toBe(form);
  });

  it("returns null for an empty response body", async () => {
    stubFetch(null);
    await expect(api.deleteUser("tok", "u1")).resolves.toBeNull();
  });

  it("falls back to raw text when the body is not JSON", async () => {
    stubFetch("not-json-text");
    await expect(api.getHealth()).resolves.toBe("not-json-text");
  });
});

describe("error message formatting", () => {
  it("uses status fallback when no structured message is present", async () => {
    stubFetch({}, { ok: false, status: 500 });
    await expect(api.getHealth()).rejects.toThrow("Request failed with status 500");
  });

  it("formats field errors with friendly labels and messages", async () => {
    stubFetch(
      {
        error: {
          message: "Validation failed",
          details: {
            formErrors: ["Top level problem"],
            fieldErrors: {
              title: ["Required"],
              timeLimitMs: ["Expected number, received nan"],
              memoryLimitKb: ["too small"]
            }
          }
        }
      },
      { ok: false, status: 422 }
    );

    await expect(api.getHealth()).rejects.toThrow(
      "Validation failed: Top level problem; Title: is required; Time limit: must be a valid number; Memory limit: too small"
    );
  });

  it("derives a label for unknown camelCase fields", async () => {
    stubFetch(
      {
        error: {
          message: "Bad",
          details: { fieldErrors: { someUnknownField: ["nope"] } }
        }
      },
      { ok: false, status: 400 }
    );

    await expect(api.getHealth()).rejects.toThrow("Bad: Some Unknown Field: nope");
  });

  it("handles string details", async () => {
    stubFetch(
      { error: { message: "Nope", details: "raw detail string" } },
      { ok: false, status: 400 }
    );
    await expect(api.getHealth()).rejects.toThrow("Nope: raw detail string");
  });

  it("handles array details", async () => {
    stubFetch(
      { error: { message: "Nope", details: ["a", "b"] } },
      { ok: false, status: 400 }
    );
    await expect(api.getHealth()).rejects.toThrow("Nope: a; b");
  });

  it("handles plain object details via entries fallback", async () => {
    stubFetch(
      { error: { message: "Nope", details: { reason: "x", code: 7 } } },
      { ok: false, status: 400 }
    );
    await expect(api.getHealth()).rejects.toThrow("Nope: reason: x; code: 7");
  });

  it("uses the bare message when details are absent", async () => {
    stubFetch({ error: { message: "Just a message" } }, { ok: false, status: 400 });
    await expect(api.getHealth()).rejects.toThrow("Just a message");
  });
});

describe("endpoint wrappers", () => {
  it("appends ?force=true only when forcing a problem delete", async () => {
    const fn = stubFetch(null);

    await api.deleteProblem("tok", "p1");
    expect(lastCall()[0]).toBe("/admin/problems/p1");

    await api.deleteProblem("tok", "p1", true);
    expect(lastCall()[0]).toBe("/admin/problems/p1?force=true");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("PATCHes the archive endpoint with the archived flag", async () => {
    stubFetch({ problem: { id: "p1", archived: true } });
    await api.archiveProblem("tok", "p1", true);

    const [url, init] = lastCall();
    expect(url).toBe("/admin/problems/p1/archive");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ archived: true }));
  });

  it("PUTs a candidate review payload", async () => {
    stubFetch({ review: {} });
    await api.saveCandidateReview("tok", "c1", "p1", {
      notes: "good",
      rubric: { problemSolving: 4, codeQuality: 3, communication: 5, testingDebugging: 2 },
      recommendation: "hire" as never
    });

    const [url, init] = lastCall();
    expect(url).toBe("/admin/candidates/c1/reviews/p1");
    expect(init?.method).toBe("PUT");
  });

  it.each<[string, () => Promise<unknown>, string, string | undefined]>([
    ["login", () => api.login("a@b.com", "secret"), "/auth/login", "POST"],
    ["changePassword", () => api.changePassword("t", "old", "newpassword"), "/me/password", "POST"],
    ["resetUserPassword", () => api.resetUserPassword("t", "u1"), "/admin/users/u1/reset-password", "POST"],
    ["getMe", () => api.getMe("t"), "/auth/me", undefined],
    ["getAssignments", () => api.getAssignments("t"), "/me/assignments", undefined],
    ["getCandidateExam", () => api.getCandidateExam("t"), "/me/exam", undefined],
    ["startCandidateExam", () => api.startCandidateExam("t"), "/me/exam/start", "POST"],
    ["getProblem", () => api.getProblem("t", "p1"), "/me/problems/p1", undefined],
    ["createCustomRun", () => api.createCustomRun("t", {} as never), "/me/custom-runs", "POST"],
    ["getCustomRun", () => api.getCustomRun("t", "r1"), "/me/custom-runs/r1", undefined],
    ["getSubmission", () => api.getSubmission("t", "s1"), "/me/submissions/s1", undefined],
    ["getMySubmissionHistory", () => api.getMySubmissionHistory("t"), "/me/submissions", undefined],
    ["getAdminProblems", () => api.getAdminProblems("t"), "/admin/problems", undefined],
    ["getProblemImpact", () => api.getProblemImpact("t", "p1"), "/admin/problems/p1/impact", undefined],
    ["createAssignment", () => api.createAssignment("t", {} as never), "/admin/assignments", "POST"],
    ["getCandidateResults", () => api.getCandidateResults("t", "c1"), "/admin/candidates/c1/results", undefined],
    [
      "getCandidateSubmissionHistory",
      () => api.getCandidateSubmissionHistory("t", "c1"),
      "/admin/candidates/c1/submissions",
      undefined
    ],
    [
      "getCandidateReviewContext",
      () => api.getCandidateReviewContext("t", "c1"),
      "/admin/candidates/c1/reviews",
      undefined
    ],
    [
      "createAdminCustomRun",
      () => api.createAdminCustomRun("t", { candidateId: "c1" } as never),
      "/admin/custom-runs",
      "POST"
    ],
    ["getAdminCustomRun", () => api.getAdminCustomRun("t", "r1"), "/admin/custom-runs/r1", undefined],
    ["deleteCandidateReview", () => api.deleteCandidateReview("t", "c1", "p1"), "/admin/candidates/c1/reviews/p1", "DELETE"],
    ["getAdminSubmissionHistory", () => api.getAdminSubmissionHistory("t"), "/admin/submissions", undefined],
    ["getCandidates", () => api.getCandidates("t"), "/admin/candidates", undefined],
    ["createCandidate", () => api.createCandidate("t", {} as never), "/admin/candidates", "POST"],
    ["deleteCandidate", () => api.deleteCandidate("t", "c1"), "/admin/candidates/c1", "DELETE"],
    ["getUsers", () => api.getUsers("t"), "/admin/users", undefined],
    ["createUser", () => api.createUser("t", {} as never), "/admin/users", "POST"],
    ["deleteUser", () => api.deleteUser("t", "u1"), "/admin/users/u1", "DELETE"],
    ["getAdminProblem", () => api.getAdminProblem("t", "p1"), "/admin/problems/p1", undefined],
    ["createPreviewSubmission", () => api.createPreviewSubmission("t", {} as never), "/admin/submissions/preview", "POST"],
    ["getPreviewSubmission", () => api.getPreviewSubmission("t", "s1"), "/admin/submissions/s1", undefined],
    ["getAdminSubmission", () => api.getAdminSubmission("t", "s1"), "/admin/submissions/s1", undefined]
  ])("%s calls %s", async (_name, call, expectedPath, expectedMethod) => {
    stubFetch({});
    await call();
    const [url, init] = lastCall();
    expect(url).toBe(expectedPath);
    expect(init?.method).toBe(expectedMethod);
  });
});
