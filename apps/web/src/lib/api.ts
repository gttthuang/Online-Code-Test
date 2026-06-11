import type {
  AssignmentSummary,
  AuthUser,
  CandidateExamSummary,
  CandidateResultsResponse,
  CandidateReviewContextResponse,
  CreateCandidateRequest,
  CreateCandidateResponse,
  CreateAssignmentRequest,
  CreateAssignmentResponse,
  CreateCustomRunRequest,
  CreateCustomRunResponse,
  CreateProblemResponse,
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  CreateUserRequest,
  CreateUserResponse,
  CustomRunDetail,
  InterviewReview,
  LoginResponse,
  ResetPasswordResponse,
  ProblemArchiveResponse,
  ProblemLifecycleImpact,
  ProblemSummary,
  ProblemDetail,
  SubmissionDetail,
  SubmissionHistoryItem
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

const validationFieldLabels: Record<string, string> = {
  title: "Title",
  description: "Description",
  difficulty: "Difficulty",
  timeLimitMs: "Time limit",
  memoryLimitKb: "Memory limit",
  supportedLanguages: "Supported languages",
  sampleInput: "Sample input",
  sampleOutput: "Sample output",
  hiddenTestCases: "Hidden testcases",
  email: "Email",
  name: "Name",
  role: "Role"
};

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

  if (typeof details === "number" || typeof details === "boolean" || typeof details === "bigint") {
    return String(details);
  }

  if (typeof details !== "object") {
    return null;
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
        messages.push(`${formatValidationField(field)}: ${value.map(formatValidationMessage).join(", ")}`);
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

function formatValidationField(field: string) {
  return validationFieldLabels[field] ?? field.replaceAll(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatValidationMessage(message: unknown) {
  const text = String(message);

  if (text.includes("Expected number, received nan")) {
    return "must be a valid number";
  }

  if (text.includes("Required")) {
    return "is required";
  }

  return text;
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

export function login(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function getMe(token: string) {
  return request<AuthUser>("/auth/me", undefined, token);
}

export function changePassword(token: string, currentPassword: string, newPassword: string) {
  return request<void>(
    "/me/password",
    {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    },
    token
  );
}

export function getAssignments(token: string) {
  return request<AssignmentSummary[]>("/me/assignments", undefined, token);
}

export function getCandidateExam(token: string) {
  return request<CandidateExamSummary>("/me/exam", undefined, token);
}

export function startCandidateExam(token: string) {
  return request<{ exam: CandidateExamSummary }>("/me/exam/start", { method: "POST" }, token);
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

export function createCustomRun(token: string, payload: CreateCustomRunRequest) {
  return request<CreateCustomRunResponse>(
    "/me/custom-runs",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function getCustomRun(token: string, runId: string) {
  return request<CustomRunDetail>(`/me/custom-runs/${runId}`, undefined, token);
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

export function deleteProblem(token: string, problemId: string, force = false) {
  const suffix = force ? "?force=true" : "";

  return request<void>(
    `/admin/problems/${problemId}${suffix}`,
    {
      method: "DELETE",
    },
    token
  );
}

export function getProblemImpact(token: string, problemId: string) {
  return request<ProblemLifecycleImpact>(`/admin/problems/${problemId}/impact`, undefined, token);
}

export function archiveProblem(token: string, problemId: string, archived: boolean) {
  return request<ProblemArchiveResponse>(
    `/admin/problems/${problemId}/archive`,
    {
      method: "PATCH",
      body: JSON.stringify({ archived })
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

export function getCandidateReviewContext(token: string, candidateId: string) {
  return request<CandidateReviewContextResponse>(`/admin/candidates/${candidateId}/reviews`, undefined, token);
}

export function createAdminCustomRun(token: string, payload: CreateCustomRunRequest & { candidateId: string }) {
  return request<CreateCustomRunResponse>(
    "/admin/custom-runs",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function getAdminCustomRun(token: string, runId: string) {
  return request<CustomRunDetail>(`/admin/custom-runs/${runId}`, undefined, token);
}

export function saveCandidateReview(
  token: string,
  candidateId: string,
  problemId: string,
  payload: {
    notes: string;
    rubric: {
      problemSolving: number;
      codeQuality: number;
      communication: number;
      testingDebugging: number;
    };
    recommendation: InterviewReview["recommendation"];
  }
) {
  return request<{ review: InterviewReview }>(
    `/admin/candidates/${candidateId}/reviews/${problemId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function deleteCandidateReview(token: string, candidateId: string, problemId: string) {
  return request<void>(
    `/admin/candidates/${candidateId}/reviews/${problemId}`,
    {
      method: "DELETE"
    },
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

export function resetUserPassword(token: string, userId: string) {
  return request<ResetPasswordResponse>(
    `/admin/users/${userId}/reset-password`,
    {
      method: "POST"
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
  return getPreviewSubmission(token, submissionId);
}

export function updateAdminProblem(token: string, problemId: string, data: FormData) {
  return request<ProblemDetail>(
    `/admin/problems/${problemId}`,
    {
      method: "PUT", 
      body: data
    },
    token
  );
}