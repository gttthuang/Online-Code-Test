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
  candidateId: string;
  problemId: string;
  language: SupportedLanguage;
}

export interface JudgeCaseResult {
  testCaseId: string;
  passed: boolean;
  executionTimeMs: number;
  memoryKb: number;
}

export interface JudgeResult {
  submissionId: string;
  status: Extract<SubmissionStatus, "finished" | "failed">;
  score: number;
  cases: JudgeCaseResult[];
  errorMessage?: string;
}
