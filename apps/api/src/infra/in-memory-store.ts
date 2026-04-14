import { randomUUID } from "node:crypto";

import type {
  AssignmentSummary,
  AuthUser,
  CandidateResultItem,
  CandidateResultsResponse,
  CreateProblemRequest,
  CreateSubmissionRequest,
  JudgeResult,
  ProblemDetail,
  ProblemSummary,
  SubmissionDetail,
  SubmissionStatus
} from "@oct/contracts";

import { buildSeedData } from "./seed.js";

interface HiddenTestCaseRecord {
  id: string;
  input: string;
  expectedOutput: string;
}

interface ProblemRecord extends ProblemDetail {
  hiddenTestCases: HiddenTestCaseRecord[];
  createdBy: string;
}

interface AssignmentRecord {
  id: string;
  candidateId: string;
  problemId: string;
  assignedBy: string;
  assignedAt: string;
}

interface SubmissionRecord extends SubmissionDetail {}

export class InMemoryStore {
  private users = new Map<string, AuthUser>();
  private problems = new Map<string, ProblemRecord>();
  private assignments = new Map<string, AssignmentRecord>();
  private submissions = new Map<string, SubmissionRecord>();

  constructor() {
    const seed = buildSeedData();

    for (const user of seed.users) {
      this.users.set(user.id, user);
    }

    for (const problem of seed.problems) {
      this.problems.set(problem.id, problem);
    }

    for (const assignment of seed.assignments) {
      this.assignments.set(assignment.id, assignment);
    }
  }

  getUserById(userId: string) {
    return this.users.get(userId) ?? null;
  }

  findUserByEmail(email: string) {
    return Array.from(this.users.values()).find((user) => user.email === email) ?? null;
  }

  listProblems(): ProblemSummary[] {
    return Array.from(this.problems.values()).map((problem) => this.toProblemSummary(problem));
  }

  getProblem(problemId: string) {
    return this.problems.get(problemId) ?? null;
  }

  getProblemDetail(problemId: string): ProblemDetail | null {
    const problem = this.getProblem(problemId);

    return problem ? this.toProblemDetail(problem) : null;
  }

  createProblem(input: CreateProblemRequest, createdBy: string): ProblemSummary {
    const problemId = `problem_${randomUUID()}`;
    const record: ProblemRecord = {
      id: problemId,
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      timeLimitMs: input.timeLimitMs,
      memoryLimitKb: input.memoryLimitKb,
      supportedLanguages: input.supportedLanguages,
      sampleInput: input.sampleInput,
      sampleOutput: input.sampleOutput,
      hiddenTestCases: (input.hiddenTestCases ?? []).map((testCase) => ({
        id: `case_${randomUUID()}`,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput
      })),
      createdBy
    };

    this.problems.set(record.id, record);

    return this.toProblemSummary(record);
  }

  isProblemAssigned(candidateId: string, problemId: string) {
    return Array.from(this.assignments.values()).some(
      (assignment) => assignment.candidateId === candidateId && assignment.problemId === problemId
    );
  }

  createAssignment(candidateId: string, problemId: string, assignedBy: string): AssignmentSummary {
    const assignmentId = `assignment_${randomUUID()}`;
    const assignedAt = new Date().toISOString();
    const record: AssignmentRecord = {
      id: assignmentId,
      candidateId,
      problemId,
      assignedBy,
      assignedAt
    };

    this.assignments.set(record.id, record);

    return this.toAssignmentSummary(record);
  }

  hasAssignment(candidateId: string, problemId: string) {
    return Array.from(this.assignments.values()).some(
      (assignment) => assignment.candidateId === candidateId && assignment.problemId === problemId
    );
  }

  listAssignmentsForCandidate(candidateId: string): AssignmentSummary[] {
    return Array.from(this.assignments.values())
      .filter((assignment) => assignment.candidateId === candidateId)
      .map((assignment) => this.toAssignmentSummary(assignment));
  }

  createSubmission(candidateId: string, input: CreateSubmissionRequest): SubmissionDetail {
    const now = new Date().toISOString();
    const submission: SubmissionRecord = {
      id: `submission_${randomUUID()}`,
      candidateId,
      problemId: input.problemId,
      language: input.language,
      sourceCode: input.sourceCode,
      status: "queued",
      score: null,
      createdAt: now,
      updatedAt: now,
      result: null
    };

    this.submissions.set(submission.id, submission);

    return this.cloneSubmission(submission);
  }

  getSubmissionById(submissionId: string) {
    const submission = this.submissions.get(submissionId);

    return submission ? this.cloneSubmission(submission) : null;
  }

  getRawSubmission(submissionId: string) {
    return this.submissions.get(submissionId) ?? null;
  }

  updateSubmissionStatus(submissionId: string, status: SubmissionStatus) {
    const submission = this.submissions.get(submissionId);

    if (!submission) {
      return null;
    }

    submission.status = status;
    submission.updatedAt = new Date().toISOString();

    return this.cloneSubmission(submission);
  }

  completeSubmission(submissionId: string, result: JudgeResult) {
    const submission = this.submissions.get(submissionId);

    if (!submission) {
      return null;
    }

    submission.status = result.status;
    submission.score = result.score;
    submission.result = result;
    submission.updatedAt = new Date().toISOString();

    return this.cloneSubmission(submission);
  }

  listCandidateResults(candidateId: string): CandidateResultsResponse | null {
    const candidate = this.getUserById(candidateId);

    if (!candidate) {
      return null;
    }

    const submissions: CandidateResultItem[] = Array.from(this.submissions.values())
      .filter((submission) => submission.candidateId === candidateId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((submission) => {
        const problem = this.getProblem(submission.problemId);

        return {
          submissionId: submission.id,
          problemId: submission.problemId,
          problemTitle: problem?.title ?? "Unknown problem",
          status: submission.status,
          score: submission.score,
          createdAt: submission.createdAt,
          updatedAt: submission.updatedAt
        };
      });

    return { candidate, submissions };
  }

  private toProblemSummary(problem: ProblemRecord): ProblemSummary {
    return {
      id: problem.id,
      title: problem.title,
      difficulty: problem.difficulty,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitKb: problem.memoryLimitKb,
      supportedLanguages: problem.supportedLanguages
    };
  }

  private toProblemDetail(problem: ProblemRecord): ProblemDetail {
    return {
      ...this.toProblemSummary(problem),
      description: problem.description,
      sampleInput: problem.sampleInput,
      sampleOutput: problem.sampleOutput
    };
  }

  private toAssignmentSummary(assignment: AssignmentRecord): AssignmentSummary {
    const problem = this.getProblem(assignment.problemId);
    const latestSubmission = Array.from(this.submissions.values())
      .filter(
        (submission) =>
          submission.candidateId === assignment.candidateId && submission.problemId === assignment.problemId
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    return {
      id: assignment.id,
      candidateId: assignment.candidateId,
      problemId: assignment.problemId,
      problemTitle: problem?.title ?? "Unknown problem",
      difficulty: problem?.difficulty ?? "easy",
      assignedAt: assignment.assignedAt,
      latestSubmissionStatus: latestSubmission?.status ?? null
    };
  }

  private cloneSubmission(submission: SubmissionRecord): SubmissionDetail {
    return {
      ...submission,
      result: submission.result
        ? {
            ...submission.result,
            cases: submission.result.cases.map((judgeCase) => ({ ...judgeCase }))
          }
        : null
    };
  }
}
