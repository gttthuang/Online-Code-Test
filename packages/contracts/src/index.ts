export const roles = ["candidate", "interviewer", "problem_admin"] as const;
export type UserRole = (typeof roles)[number];

export const submissionStatuses = [
  "queued",
  "running",
  "finished",
  "failed"
] as const;
export type SubmissionStatus = (typeof submissionStatuses)[number];

export const languages = ["python", "cpp"] as const;
export type SupportedLanguage = (typeof languages)[number];

export const problemDifficulties = ["easy", "medium", "hard"] as const;
export type ProblemDifficulty = (typeof problemDifficulties)[number];

export const reviewRecommendations = [
  "strong_hire",
  "hire",
  "lean_hire",
  "lean_no_hire",
  "no_hire"
] as const;
export type ReviewRecommendation = (typeof reviewRecommendations)[number];

export const judgeQueueName = "judge-submissions";
export const judgeQueueJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1_000
  },
  removeOnComplete: 500,
  removeOnFail: 500
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface CreateCandidateRequest {
  name: string;
  email: string;
}

export interface CreateCandidateResponse {
  candidate: AuthUser;
  /** One-time generated password to hand to the candidate; shown only at creation. */
  password: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: UserRole;
}

export interface CreateUserResponse {
  user: AuthUser;
  /** One-time generated password to hand to the account holder; shown only at creation. */
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  /** One-time generated replacement password to hand to the account holder. */
  password: string;
}

/** Minimum length enforced on a chosen password (server and client). */
export const MIN_PASSWORD_LENGTH = 8;

export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: ProblemDifficulty;
  timeLimitMs: number;
  memoryLimitKb: number;
  supportedLanguages: SupportedLanguage[];
  archivedAt: string | null;
  displayId: number | null;
}

export interface ProblemDetail extends ProblemSummary {
  description: string;
  sampleInput: string;
  sampleOutput: string;
  constraints?: string;
  inputSpec?: string;
  outputSpec?: string;
  sampleExplanation?: string;
  templateCode?: string | null;
  hiddenTestCases?: Array<{
    id: string;
    input: string;
    expectedOutput: string;
  }>;
}

export interface HiddenTestCaseInput {
  input: string;
  expectedOutput: string;
}

export interface CreateProblemRequest {
  title: string;
  description: string;
  difficulty: ProblemDifficulty;
  timeLimitMs: number;
  memoryLimitKb: number;
  supportedLanguages: SupportedLanguage[];
  sampleInput: string;
  sampleOutput: string;
  constraints?: string | null;
  inputSpec?: string | null;
  outputSpec?: string | null;
  sampleExplanation?: string | null;
  templateCode?: string | null;
  hiddenTestCases?: HiddenTestCaseInput[];
}

export interface CreateProblemResponse {
  problem: ProblemSummary;
}

export interface ProblemLifecycleImpact {
  problemId: string;
  assignments: number;
  candidateSubmissions: number;
  previewSubmissions: number;
  reviews: number;
  canDeleteWithoutForce: boolean;
  mode?: "delete" | "modify";
}

export interface ProblemArchiveRequest {
  archived: boolean;
}

export interface ProblemArchiveResponse {
  problem: ProblemSummary;
}

export interface AssignmentSummary {
  id: string;
  candidateId: string;
  problemId: string;
  problemTitle: string;
  difficulty: ProblemDifficulty;
  assignedAt: string;
  durationMinutes: number;
  startedAt: string | null;
  expiresAt: string | null;
  latestSubmissionStatus: SubmissionStatus | null;
  displayId?: number;
}

export interface CreateAssignmentRequest {
  candidateId: string;
  problemId?: string;
  problemIds?: string[];
  durationMinutes?: number;
}

export interface CreateAssignmentResponse {
  assignment: AssignmentSummary;
  assignments: AssignmentSummary[];
}

export type CandidateExamStatus = "not_started" | "started" | "expired";

export interface CandidateExamSummary {
  status: CandidateExamStatus;
  assignmentCount: number;
  durationMinutes: number | null;
  startedAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number | null;
  assignments: AssignmentSummary[];
}

export interface StartCandidateExamResponse {
  exam: CandidateExamSummary;
}

export interface CreateSubmissionRequest {
  problemId: string;
  language: SupportedLanguage;
  sourceCode: string;
}

export interface CreateSubmissionResponse {
  submissionId: string;
  status: SubmissionStatus;
}

export interface CreateCustomRunRequest {
  problemId: string;
  language: SupportedLanguage;
  sourceCode: string;
  stdin: string;
}

export interface CreateAdminCustomRunRequest extends CreateCustomRunRequest {
  candidateId: string;
}

export interface CreateCustomRunResponse {
  runId: string;
  status: SubmissionStatus;
}

export interface CustomRunDetail {
  id: string;
  candidateId: string;
  problemId: string;
  requestedBy: string;
  language: SupportedLanguage;
  sourceCode: string;
  stdin: string;
  status: SubmissionStatus;
  stdout: string | null;
  stderr: string | null;
  errorType: JudgeFailureType | null;
  errorMessage: string | null;
  executionTimeMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export type JudgeJob =
  | {
      kind?: "submission";
      submissionId: string;
    }
  | {
      kind: "custom_run";
      runId: string;
    };

export function getJudgeJobId(job: JudgeJob) {
  return job.kind === "custom_run" ? `custom-run-${job.runId}` : `submission-${job.submissionId}`;
}

export interface JudgeCaseResult {
  testCaseId: string;
  passed: boolean;
  executionTimeMs: number;
  memoryKb: number;
}

export const judgeFailureTypes = [
  "compile_error",
  "runtime_error",
  "time_limit_exceeded",
  "sandbox_error",
  "system_error"
] as const;
export type JudgeFailureType = (typeof judgeFailureTypes)[number];

export interface JudgeResult {
  submissionId: string;
  status: Extract<SubmissionStatus, "finished" | "failed">;
  score: number;
  cases: JudgeCaseResult[];
  errorType?: JudgeFailureType;
  errorMessage?: string;
}

export interface SubmissionDetail {
  id: string;
  candidateId: string;
  problemId: string;
  language: SupportedLanguage;
  status: SubmissionStatus;
  sourceCode: string;
  score: number | null;
  createdAt: string;
  updatedAt: string;
  result: JudgeResult | null;
}

export interface SubmissionHistoryItem extends SubmissionDetail {
  candidateName: string;
  candidateEmail: string;
  candidateRole: UserRole;
  problemTitle: string;
  passedCases: number;
  totalCases: number;
  displayId?: number;
}

export interface CandidateResultItem {
  submissionId: string;
  problemId: string;
  problemTitle: string;
  status: SubmissionStatus;
  score: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateResultsResponse {
  candidate: AuthUser;
  submissions: CandidateResultItem[];
}

export interface InterviewRubric {
  problemSolving: number;
  codeQuality: number;
  communication: number;
  testingDebugging: number;
}

export interface InterviewReview {
  id: string;
  candidateId: string;
  problemId: string;
  problemTitle: string;
  interviewerId: string;
  interviewerName: string;
  notes: string;
  rubric: InterviewRubric;
  recommendation: ReviewRecommendation;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertInterviewReviewRequest {
  notes: string;
  rubric: InterviewRubric;
  recommendation: ReviewRecommendation;
}

export interface CandidateReviewContextResponse {
  candidate: AuthUser;
  assignments: AssignmentSummary[];
  reviews: InterviewReview[];
}
