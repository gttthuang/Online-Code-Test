import type {
  AssignmentSummary,
  AuthUser,
  CandidateExamSummary,
  CandidateResultsResponse,
  CandidateReviewContextResponse,
  CreateCustomRunRequest,
  CreateCandidateRequest,
  CreateProblemRequest,
  CreateSubmissionRequest,
  CreateUserRequest,
  CustomRunDetail,
  InterviewReview,
  JudgeFailureType,
  JudgeResult,
  ProblemDetail,
  ProblemLifecycleImpact,
  ProblemSummary,
  SubmissionDetail,
  SubmissionHistoryItem,
  SubmissionStatus
} from "@oct/contracts";

export interface HiddenTestCaseRecord {
  id: string;
  input: string;
  expectedOutput: string;
}

export interface ProblemRecord extends ProblemDetail {
  hiddenTestCases: HiddenTestCaseRecord[];
  createdBy: string;
}

export interface InternalStats {
  totals: {
    candidates: number;
    problems: number;
    assignments: number;
    submissions: number;
  };
  submissionsByStatus: Record<SubmissionStatus, number>;
  failuresByType: Record<JudgeFailureType, number>;
  judgeCases: {
    total: number;
    averageExecutionTimeMs: number | null;
  };
}

export interface UserCredential {
  user: AuthUser;
  passwordHash: string;
}

export interface AppStore {
  getUserById(userId: string): Promise<AuthUser | null>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserCredentialByEmail(email: string): Promise<UserCredential | null>;
  listUsers(): Promise<AuthUser[]>;
  createUser(input: CreateUserRequest, passwordHash: string): Promise<AuthUser>;
  deleteUser(userId: string): Promise<boolean>;
  hasUserReferences(userId: string): Promise<boolean>;
  listCandidates(): Promise<AuthUser[]>;
  createCandidate(input: CreateCandidateRequest, passwordHash: string): Promise<AuthUser>;
  listProblems(): Promise<ProblemSummary[]>;
  getProblem(problemId: string): Promise<ProblemRecord | null>;
  getProblemDetail(problemId: string): Promise<ProblemDetail | null>;
  getAdminProblemDetail(problemId: string): Promise<ProblemDetail | null>;
  createProblem(input: CreateProblemRequest, createdBy: string): Promise<ProblemSummary>;
  getProblemLifecycleImpact(problemId: string): Promise<ProblemLifecycleImpact | null>;
  archiveProblem(problemId: string, archived: boolean): Promise<ProblemSummary | null>;
  hasAnyAssignment(problemId: string): Promise<boolean>;
  hasAnySubmission(problemId: string): Promise<boolean>;
  deleteProblem(problemId: string, options?: { force?: boolean }): Promise<boolean>;
  deleteCandidate(candidateId: string): Promise<boolean>;
  hasAnyAssignmentForCandidate(candidateId: string): Promise<boolean>;
  hasAnySubmissionByCandidate(candidateId: string): Promise<boolean>;
  isProblemAssigned(candidateId: string, problemId: string): Promise<boolean>;
  createAssignment(
    candidateId: string,
    problemId: string,
    assignedBy: string,
    durationMinutes?: number
  ): Promise<AssignmentSummary>;
  createAssignments(
    candidateId: string,
    problemIds: string[],
    assignedBy: string,
    durationMinutes: number
  ): Promise<AssignmentSummary[]>;
  hasAssignment(candidateId: string, problemId: string): Promise<boolean>;
  listAssignmentsForCandidate(candidateId: string): Promise<AssignmentSummary[]>;
  getCandidateExam(candidateId: string): Promise<CandidateExamSummary>;
  startCandidateExam(candidateId: string): Promise<CandidateExamSummary>;
  createSubmission(candidateId: string, input: CreateSubmissionRequest): Promise<SubmissionDetail>;
  createCustomRun(input: {
    candidateId: string;
    problemId: string;
    requestedBy: string;
    run: CreateCustomRunRequest;
  }): Promise<CustomRunDetail>;
  getCustomRun(runId: string): Promise<CustomRunDetail | null>;
  getSubmissionById(submissionId: string): Promise<SubmissionDetail | null>;
  getSubmissionHistoryItem(submissionId: string): Promise<SubmissionHistoryItem | null>;
  listSubmissions(filters?: {
    candidateId?: string;
    problemId?: string;
    candidateRole?: AuthUser["role"];
  }): Promise<SubmissionHistoryItem[]>;
  getRawSubmission(submissionId: string): Promise<SubmissionDetail | null>;
  updateSubmissionStatus(submissionId: string, status: SubmissionStatus): Promise<SubmissionDetail | null>;
  completeSubmission(submissionId: string, result: JudgeResult): Promise<SubmissionDetail | null>;
  listCandidateResults(candidateId: string): Promise<CandidateResultsResponse | null>;
  getCandidateReviewContext(candidateId: string, interviewerId: string): Promise<CandidateReviewContextResponse | null>;
  upsertInterviewReview(input: {
    candidateId: string;
    problemId: string;
    interviewerId: string;
    notes: string;
    problemSolving: number;
    codeQuality: number;
    communication: number;
    testingDebugging: number;
    recommendation: InterviewReview["recommendation"];
  }): Promise<InterviewReview | null>;
  deleteInterviewReview(candidateId: string, problemId: string, interviewerId: string): Promise<boolean>;
  getInternalStats(): Promise<InternalStats>;
  updateProblem(problemId: string, data: CreateProblemRequest): Promise<ProblemDetail | null>;
}
