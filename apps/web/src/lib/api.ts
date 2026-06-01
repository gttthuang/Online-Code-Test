import type {
  AssignmentSummary,
  AuthUser,
  CandidateResultsResponse,
  CreateAssignmentRequest,
  CreateAssignmentResponse,
  CreateProblemResponse,
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  CreateUserRequest,
  CreateUserResponse,
  LoginResponse,
  ProblemSummary,
  ProblemDetail,
  SubmissionDetail,
  SubmissionHistoryItem,
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
    details?: unknown;
  };
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

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
      const details = formatErrorDetails(error.details);
      return details ? `${error.message}: ${details}` : error.message;
    }
  }

  return `Request failed with status ${status}`;
}

function formatErrorDetails(details: unknown): string | null {
  if (!details) {
    return null;
  }

  if (typeof details === "string") {
    return details;
  }

  if (Array.isArray(details)) {
    return details.map(String).join("; ");
  }

  if (typeof details !== "object") {
    return String(details);
  }

  const detailObject = details as {
    formErrors?: unknown;
    fieldErrors?: Record<string, unknown>;
  };
  const messages: string[] = [];

  if (Array.isArray(detailObject.formErrors)) {
    messages.push(...detailObject.formErrors.map(String));
  }

  if (detailObject.fieldErrors) {
    for (const [field, value] of Object.entries(detailObject.fieldErrors)) {
      if (Array.isArray(value) && value.length > 0) {
        messages.push(`${field}: ${value.map(String).join(", ")}`);
      }
    }
  }

  if (messages.length > 0) {
    return messages.join("; ");
  }

  return Object.entries(details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("; ");
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

  const response = await fetch(`${apiBaseUrl}${path}`, {
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

export function getMySubmissionHistory(token: string) {
  return request<SubmissionHistoryItem[]>("/me/submissions", undefined, token);
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

export function getCandidateSubmissionHistory(token: string, candidateId: string) {
  return request<{ candidate: AuthUser; submissions: SubmissionHistoryItem[] }>(
    `/admin/candidates/${candidateId}/submissions`,
    undefined,
    token
  );
}

export function getAdminSubmissionHistory(token: string) {
  return request<SubmissionHistoryItem[]>("/admin/submissions", undefined, token);
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

export function getUsers(token: string) {
  return request<AuthUser[]>("/admin/users", undefined, token);
}

export function createUser(token: string, payload: CreateUserRequest) {
  return request<CreateUserResponse>(
    "/admin/users",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function deleteUser(token: string, userId: string) {
  return request<void>(
    `/admin/users/${userId}`,
    {
      method: "DELETE"
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
  return request<SubmissionHistoryItem>(
    `/admin/submissions/${submissionId}`,
    undefined,
    token
  );
}

export function getAdminSubmission(token: string, submissionId: string) {
  return request<SubmissionHistoryItem>(
    `/admin/submissions/${submissionId}`,
    undefined,
    token
  );
}
