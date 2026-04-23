import type {
  AssignmentSummary,
  AuthUser,
  CandidateResultsResponse,
  CreateProblemRequest,
  CreateSubmissionRequest,
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

export interface AppStore {
  getUserById(userId: string): Promise<AuthUser | null>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  listProblems(): Promise<ProblemSummary[]>;
  getProblem(problemId: string): Promise<ProblemRecord | null>;
  getProblemDetail(problemId: string): Promise<ProblemDetail | null>;
  createProblem(input: CreateProblemRequest, createdBy: string): Promise<ProblemSummary>;
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
}
