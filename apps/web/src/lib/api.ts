import type {
  AssignmentSummary,
  AuthUser,
  CandidateResultsResponse,
  CreateAssignmentRequest,
  CreateAssignmentResponse,
  CreateProblemResponse,
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  LoginResponse,
  ProblemSummary,
  ProblemDetail,
  SubmissionDetail,
  CreateCandidateRequest,
  CreateCandidateResponse
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

function safeJsonParse<T>(text: string): T | string {
  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}

function getErrorMessage(payload: unknown, status: number) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload
  ) {
    const error = (payload as ApiErrorPayload).error;

    if (error?.message) {
      return error.message;
    }
  }

  return `Request failed with status ${status}`;
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers);

  const isFormData = init?.body instanceof FormData;

  if (!headers.has("Content-Type") && init?.body && !isFormData) {
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
  const payload = text ? safeJsonParse<T>(text) : null;

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, response.status));
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

export function createProblem(token: string, formData: FormData) {
  return request<CreateProblemResponse>(
    "/admin/problems",
    {
      method: "POST",
      body: formData
    },
    token
  );
}

export function deleteProblem(token: string, problemId: string) {
  return request<void>(
    `/admin/problems/${problemId}`,
    {
      method: "DELETE",
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

export function getCandidates(token: string) {
  return request<AuthUser[]>("/admin/candidates", undefined, token);
}

export function createCandidate(token: string, payload: CreateCandidateRequest) {
  return request<CreateCandidateResponse>(
    "/admin/candidates",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function deleteCandidate(token: string, candidateId: string) {
  return request<void>(
    `/admin/candidates/${candidateId}`,
    {
      method: "DELETE",
    },
    token
  );
}

export function getAdminProblem(token: string, problemId: string) {
  return request<ProblemDetail>(
    `/admin/problems/${problemId}`,
    undefined,
    token
  );
}

export function createPreviewSubmission(
  token: string,
  payload: CreateSubmissionRequest
) {
  return request<CreateSubmissionResponse>(
    "/admin/submissions/preview",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function getPreviewSubmission(
  token: string,
  submissionId: string
) {
  return request<SubmissionDetail>(
    `/admin/submissions/${submissionId}`,
    undefined,
    token
  );
}
