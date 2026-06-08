import type { UserRole } from "@oct/contracts";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRouteDefinition = {
  method: ApiMethod;
  path: string;
  operationId: string;
  summary: string;
  tag: "System" | "Auth" | "Candidate" | "Interviewer" | "Admin";
  access: "public" | "authenticated" | "ops";
  roles?: readonly UserRole[];
  successStatus?: 200 | 204;
};

export const apiRouteDefinitions = [
  route("GET", "/", "getServiceIndex", "Read the API service index", "System", "public"),
  route("GET", "/healthz", "getHealth", "Check whether the API process is alive", "System", "public"),
  route("GET", "/readyz", "getReadiness", "Check PostgreSQL and Redis readiness", "System", "public"),
  route("GET", "/metrics", "getMetrics", "Read Prometheus operational metrics", "System", "ops"),
  route("GET", "/internal/stats", "getInternalStats", "Read judge and submission statistics", "System", "ops"),
  route("GET", "/openapi.json", "getOpenApiDocument", "Read the machine-readable API contract", "System", "public"),
  route("POST", "/auth/login", "login", "Sign in with a demo account email", "Auth", "public"),
  route("GET", "/auth/me", "getCurrentUser", "Read the authenticated user", "Auth", "authenticated"),

  roleRoute("GET", "/me/exam", "getCandidateExam", "Read candidate exam state", "Candidate", ["candidate"]),
  roleRoute("POST", "/me/exam/start", "startCandidateExam", "Start the candidate exam timer", "Candidate", ["candidate"]),
  roleRoute("GET", "/me/assignments", "listCandidateAssignments", "List unlocked candidate assignments", "Candidate", ["candidate"]),
  roleRoute("GET", "/me/problems/:problemId", "getCandidateProblem", "Read an assigned problem", "Candidate", ["candidate"]),
  roleRoute("GET", "/me/submissions", "listCandidateSubmissions", "List candidate submissions", "Candidate", ["candidate"]),
  roleRoute("POST", "/me/submissions", "createCandidateSubmission", "Queue a candidate submission", "Candidate", ["candidate"]),
  roleRoute("GET", "/me/submissions/:submissionId", "getCandidateSubmission", "Read a candidate submission", "Candidate", ["candidate"]),
  roleRoute("POST", "/me/custom-runs", "createCandidateCustomRun", "Queue a custom input run", "Candidate", ["candidate"]),
  roleRoute("GET", "/me/custom-runs/:runId", "getCandidateCustomRun", "Read a custom input run", "Candidate", ["candidate"]),

  roleRoute("GET", "/admin/candidates", "listCandidates", "List candidate accounts", "Interviewer", ["interviewer"]),
  roleRoute("POST", "/admin/candidates", "createCandidate", "Create a candidate account", "Interviewer", ["interviewer"]),
  roleRoute(
    "DELETE",
    "/admin/candidates/:candidateId",
    "deleteCandidate",
    "Delete an unused candidate account",
    "Interviewer",
    ["interviewer"],
    204
  ),
  roleRoute("POST", "/admin/assignments", "createAssignments", "Assign problems and a time limit", "Interviewer", ["interviewer"]),
  roleRoute(
    "GET",
    "/admin/candidates/:candidateId/results",
    "getCandidateResults",
    "Read candidate result summaries",
    "Interviewer",
    ["interviewer"]
  ),
  roleRoute(
    "GET",
    "/admin/candidates/:candidateId/reviews",
    "getCandidateReviews",
    "Read candidate review context",
    "Interviewer",
    ["interviewer"]
  ),
  roleRoute(
    "PUT",
    "/admin/candidates/:candidateId/reviews/:problemId",
    "upsertCandidateReview",
    "Create or update interviewer notes and rubric",
    "Interviewer",
    ["interviewer"]
  ),
  roleRoute(
    "DELETE",
    "/admin/candidates/:candidateId/reviews/:problemId",
    "deleteCandidateReview",
    "Delete interviewer notes and rubric",
    "Interviewer",
    ["interviewer"],
    204
  ),

  roleRoute("GET", "/admin/users", "listUsers", "List all user accounts", "Interviewer", ["interviewer"]),
  roleRoute("POST", "/admin/users", "createUser", "Create a user account with a role", "Interviewer", ["interviewer"]),
  roleRoute(
    "DELETE",
    "/admin/users/:userId",
    "deleteUser",
    "Delete an unused user account",
    "Interviewer",
    ["interviewer"],
    204
  ),
  roleRoute(
    "GET",
    "/admin/problems",
    "listAdminProblems",
    "List problems for interviewers and admins",
    "Admin",
    ["interviewer", "problem_admin"]
  ),
  roleRoute("POST", "/admin/problems", "createProblem", "Create a problem", "Admin", ["problem_admin"]),
  roleRoute(
    "GET",
    "/admin/problems/:problemId",
    "getAdminProblem",
    "Read a problem including authoring fields",
    "Admin",
    ["interviewer", "problem_admin"]
  ),
  roleRoute("PUT", "/admin/problems/:problemId", "updateProblem", "Replace a problem", "Admin", ["problem_admin"]),
  roleRoute(
    "GET",
    "/admin/problems/:problemId/impact",
    "getProblemLifecycleImpact",
    "Inspect references before deleting a problem",
    "Admin",
    ["problem_admin"]
  ),
  roleRoute(
    "PATCH",
    "/admin/problems/:problemId/archive",
    "archiveProblem",
    "Archive or restore a problem",
    "Admin",
    ["problem_admin"]
  ),
  roleRoute(
    "DELETE",
    "/admin/problems/:problemId",
    "deleteProblem",
    "Delete a problem, optionally forcing reference cleanup",
    "Admin",
    ["problem_admin"],
    204
  ),
  roleRoute(
    "GET",
    "/admin/candidates/:candidateId/submissions",
    "listCandidateSubmissionHistory",
    "Read a candidate submission history",
    "Interviewer",
    ["interviewer", "problem_admin"]
  ),
  roleRoute("GET", "/admin/submissions", "listAllSubmissions", "List all submissions", "Admin", ["problem_admin"]),
  roleRoute(
    "POST",
    "/admin/submissions/preview",
    "createPreviewSubmission",
    "Queue an admin preview submission",
    "Admin",
    ["problem_admin"]
  ),
  roleRoute(
    "GET",
    "/admin/submissions/:submissionId",
    "getAdminSubmission",
    "Read submission code and judge details",
    "Admin",
    ["interviewer", "problem_admin"]
  ),
  roleRoute(
    "POST",
    "/admin/custom-runs",
    "createAdminCustomRun",
    "Queue a custom input run for candidate review or preview",
    "Admin",
    ["interviewer", "problem_admin"]
  ),
  roleRoute(
    "GET",
    "/admin/custom-runs/:runId",
    "getAdminCustomRun",
    "Read an interviewer or admin custom run",
    "Admin",
    ["interviewer", "problem_admin"]
  )
] as const satisfies readonly ApiRouteDefinition[];

export function apiRouteKey(method: string, path: string) {
  return `${method.toUpperCase()} ${path}`;
}

export function assertApiRouteContract(registeredRoutes: ReadonlySet<string>) {
  const documentedRoutes = new Set(
    apiRouteDefinitions.map(({ method, path }) => apiRouteKey(method, path))
  );
  const undocumented = [...registeredRoutes].filter((key) => !documentedRoutes.has(key)).sort();
  const missing = [...documentedRoutes].filter((key) => !registeredRoutes.has(key)).sort();

  if (undocumented.length === 0 && missing.length === 0) {
    return;
  }

  throw new Error([
    "API route contract does not match the registered Fastify routes.",
    undocumented.length > 0 ? `Undocumented routes: ${undocumented.join(", ")}` : "",
    missing.length > 0 ? `Missing routes: ${missing.join(", ")}` : ""
  ].filter(Boolean).join("\n"));
}

export function createOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const definition of apiRouteDefinitions) {
    const openApiPath = definition.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const parameters = [...definition.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
      name: match[1],
      in: "path",
      required: true,
      schema: {
        type: "string",
        minLength: 1
      }
    }));

    paths[openApiPath] ??= {};
    paths[openApiPath][definition.method.toLowerCase()] = {
      operationId: definition.operationId,
      summary: definition.summary,
      tags: [definition.tag],
      security: definition.access === "public"
        ? []
        : [{ [definition.access === "ops" ? "opsBearer" : "bearerAuth"]: [] }],
      ...(definition.roles ? { "x-roles": definition.roles } : {}),
      ...(parameters.length > 0 ? { parameters } : {}),
      responses: createOpenApiResponses(definition.successStatus ?? 200)
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Online Code Test API",
      version: "1.0.0",
      description: "Canonical route and access contract. Payload examples are documented in docs/api-contract.md."
    },
    tags: [
      { name: "System" },
      { name: "Auth" },
      { name: "Candidate" },
      { name: "Interviewer" },
      { name: "Admin" }
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        },
        opsBearer: {
          type: "http",
          scheme: "bearer",
          description: "Operations token configured through OPS_TOKEN."
        }
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {}
              }
            }
          }
        }
      }
    },
    "x-human-docs": "docs/api-contract.md"
  };
}

function route(
  method: ApiMethod,
  path: string,
  operationId: string,
  summary: string,
  tag: ApiRouteDefinition["tag"],
  access: ApiRouteDefinition["access"],
  successStatus: ApiRouteDefinition["successStatus"] = 200
): ApiRouteDefinition {
  return { method, path, operationId, summary, tag, access, successStatus };
}

function roleRoute(
  method: ApiMethod,
  path: string,
  operationId: string,
  summary: string,
  tag: ApiRouteDefinition["tag"],
  roles: readonly UserRole[],
  successStatus: ApiRouteDefinition["successStatus"] = 200
): ApiRouteDefinition {
  return {
    method,
    path,
    operationId,
    summary,
    tag,
    access: "authenticated",
    roles,
    successStatus
  };
}

function createOpenApiResponses(successStatus: 200 | 204) {
  return {
    [successStatus]: {
      description: successStatus === 204 ? "Successful response with no content" : "Successful response"
    },
    "400": {
      description: "Invalid request",
      content: errorResponseContent()
    },
    "401": {
      description: "Authentication required",
      content: errorResponseContent()
    },
    "403": {
      description: "Insufficient role or resource access",
      content: errorResponseContent()
    },
    "404": {
      description: "Resource not found",
      content: errorResponseContent()
    }
  };
}

function errorResponseContent() {
  return {
    "application/json": {
      schema: {
        $ref: "#/components/schemas/ErrorResponse"
      }
    }
  };
}
