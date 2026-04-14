import type {
  AssignmentSummary,
  AuthUser,
  CandidateResultsResponse,
  CreateAssignmentRequest,
  CreateAssignmentResponse,
  CreateProblemRequest,
  CreateProblemResponse,
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  LoginResponse,
  ProblemSummary,
  ProblemDetail,
  SubmissionDetail
} from "@oct/contracts";

interface HealthResponse {
  status: string;
  service: string;
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T | ApiErrorPayload) : null;

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload && payload.error?.message
        ? payload.error.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}

export function getHealth() {
  return request<HealthResponse>("/healthz");
}

export function loginWithEmail(email: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function getMe(token: string) {
  return request<AuthUser>("/auth/me", undefined, token);
}

export function getAssignments(token: string) {
  return request<AssignmentSummary[]>("/me/assignments", undefined, token);
}

export function getProblem(token: string, problemId: string) {
  return request<ProblemDetail>(`/me/problems/${problemId}`, undefined, token);
}

export function createSubmission(token: string, payload: CreateSubmissionRequest) {
  return request<CreateSubmissionResponse>(
    "/me/submissions",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function getSubmission(token: string, submissionId: string) {
  return request<SubmissionDetail>(`/me/submissions/${submissionId}`, undefined, token);
}

export function getAdminProblems(token: string) {
  return request<ProblemSummary[]>("/admin/problems", undefined, token);
}

export function createProblem(token: string, payload: CreateProblemRequest) {
  return request<CreateProblemResponse>(
    "/admin/problems",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function createAssignment(token: string, payload: CreateAssignmentRequest) {
  return request<CreateAssignmentResponse>(
    "/admin/assignments",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function getCandidateResults(token: string, candidateId: string) {
  return request<CandidateResultsResponse>(`/admin/candidates/${candidateId}/results`, undefined, token);
}
