import type {
  AssignmentSummary,
  AuthUser,
  CandidateResultsResponse,
  CreateCandidateRequest,
  CreateProblemRequest,
  CreateSubmissionRequest,
  CreateUserRequest,
  JudgeFailureType,
  JudgeResult,
  ProblemDetail,
  ProblemSummary,
  SubmissionDetail,
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

export interface AppStore {
  getUserById(userId: string): Promise<AuthUser | null>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  listUsers(): Promise<AuthUser[]>;
  createUser(input: CreateUserRequest): Promise<AuthUser>;
  deleteUser(userId: string): Promise<boolean>;
  hasUserReferences(userId: string): Promise<boolean>;
  listCandidates(): Promise<AuthUser[]>;
  createCandidate(input: CreateCandidateRequest): Promise<AuthUser>;
  listProblems(): Promise<ProblemSummary[]>;
  getProblem(problemId: string): Promise<ProblemRecord | null>;
  getProblemDetail(problemId: string): Promise<ProblemDetail | null>;
  createProblem(input: CreateProblemRequest, createdBy: string): Promise<ProblemSummary>;
  hasAnyAssignment(problemId: string): Promise<boolean>;
  hasAnySubmission(problemId: string): Promise<boolean>;
  deleteProblem(problemId: string): Promise<boolean>;
  deleteCandidate(candidateId: string): Promise<boolean>;
  hasAnyAssignmentForCandidate(candidateId: string): Promise<boolean>;
  hasAnySubmissionByCandidate(candidateId: string): Promise<boolean>;
  isProblemAssigned(candidateId: string, problemId: string): Promise<boolean>;
  createAssignment(candidateId: string, problemId: string, assignedBy: string): Promise<AssignmentSummary>;
  hasAssignment(candidateId: string, problemId: string): Promise<boolean>;
  listAssignmentsForCandidate(candidateId: string): Promise<AssignmentSummary[]>;
  createSubmission(candidateId: string, input: CreateSubmissionRequest): Promise<SubmissionDetail>;
  getSubmissionById(submissionId: string): Promise<SubmissionDetail | null>;
  getRawSubmission(submissionId: string): Promise<SubmissionDetail | null>;
  updateSubmissionStatus(submissionId: string, status: SubmissionStatus): Promise<SubmissionDetail | null>;
  completeSubmission(submissionId: string, result: JudgeResult): Promise<SubmissionDetail | null>;
  listCandidateResults(candidateId: string): Promise<CandidateResultsResponse | null>;
  getInternalStats(): Promise<InternalStats>;
}
