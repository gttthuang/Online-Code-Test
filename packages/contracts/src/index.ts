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

export const judgeQueueName = "{judge-submissions}";

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
}

export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: ProblemDifficulty;
  timeLimitMs: number;
  memoryLimitKb: number;
  supportedLanguages: SupportedLanguage[];
}

export interface ProblemDetail extends ProblemSummary {
  description: string;
  sampleInput: string;
  sampleOutput: string;
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
  hiddenTestCases?: HiddenTestCaseInput[];
}

export interface CreateProblemResponse {
  problem: ProblemSummary;
}

export interface AssignmentSummary {
  id: string;
  candidateId: string;
  problemId: string;
  problemTitle: string;
  difficulty: ProblemDifficulty;
  assignedAt: string;
  latestSubmissionStatus: SubmissionStatus | null;
}

export interface CreateAssignmentRequest {
  candidateId: string;
  problemId: string;
}

export interface CreateAssignmentResponse {
  assignment: AssignmentSummary;
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

export interface JudgeJob {
  submissionId: string;
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
