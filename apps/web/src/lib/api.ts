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
async function request<T>(
  path: string,
  init?: RequestInit,
  token?: string
): Promise<T> {
  function safeJsonParse<T>(text: string): T {
    try {
      return JSON.parse(text);
    } catch {
      // backend 回非 JSON（例如 upload / empty response）
      return text as unknown as T;
    }
  }
  const headers = new Headers(init?.headers);

  const isFormData = init?.body instanceof FormData;

  // 只有非 FormData 才設 JSON header
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

  // FormData response 不一定是 JSON（保險）
  const payload = text ? safeJsonParse<T>(text) : null;

  if (!response.ok) {
    console.error("API ERROR STATUS:", response.status);
    console.error("RAW RESPONSE:", text);

    let message = `Request failed with status ${response.status}`;

    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload
    ) {
      const err = (payload as any).error;

      if (err?.message) {
        message = err.message;
      }
    }

    throw new Error(message);
  }

  return payload as T;
}
// async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
//   const headers = new Headers(init?.headers);

//   if (!headers.has("Content-Type") && init?.body) {
//     headers.set("Content-Type", "application/json");
//   }

//   if (token) {
//     headers.set("Authorization", `Bearer ${token}`);
//   }

//   const response = await fetch(path, {
//     ...init,
//     headers
//   });

//   const text = await response.text();
//   const payload = text ? (JSON.parse(text) as T | ApiErrorPayload) : null;

//   if (!response.ok) {
//     const message =
//       typeof payload === "object" && payload && "error" in payload && payload.error?.message
//         ? payload.error.message
//         : `Request failed with status ${response.status}`;

//     throw new Error(message);
//   }

//   return payload as T;
// }

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

// export function createProblem(token: string, payload: CreateProblemRequest) {
//   return request<CreateProblemResponse>(
//     "/admin/problems",
//     {
//       method: "POST",
//       body: JSON.stringify(payload)
//     },
//     token
//   );
// }
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