import { randomUUID } from "node:crypto";

import type {
  AssignmentSummary,
  AuthUser,
  CandidateResultItem,
  CandidateResultsResponse,
  CandidateReviewContextResponse,
  CreateCandidateRequest,
  CreateCustomRunRequest,
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
import type { Pool } from "pg";

import type { AppStore, HiddenTestCaseRecord, InternalStats, ProblemRecord } from "./store.js";

type ProblemRow = {
  id: string;
  title: string;
  description: string;
  difficulty: ProblemSummary["difficulty"];
  time_limit_ms: number;
  memory_limit_kb: number;
  supported_languages: string[];
  sample_input: string;
  sample_output: string;
  created_by: string;
  archived_at: string | null;
};

type AssignmentRow = {
  id: string;
  candidate_id: string;
  problem_id: string;
  assigned_by: string;
  assigned_at: string;
};

type SubmissionRow = {
  id: string;
  candidate_id: string;
  problem_id: string;
  language: SubmissionDetail["language"];
  source_code: string;
  status: SubmissionStatus;
  score: number | null;
  error_type: JudgeFailureType | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type SubmissionHistoryRow = SubmissionRow & {
  candidate_name: string;
  candidate_email: string;
  candidate_role: AuthUser["role"];
  problem_title: string;
};

type CustomRunRow = {
  id: string;
  candidate_id: string;
  problem_id: string;
  requested_by: string;
  language: CustomRunDetail["language"];
  source_code: string;
  stdin: string;
  status: SubmissionStatus;
  stdout: string | null;
  stderr: string | null;
  error_type: JudgeFailureType | null;
  error_message: string | null;
  execution_time_ms: number | null;
  created_at: string;
  updated_at: string;
};

type InterviewReviewRow = {
  id: string;
  candidate_id: string;
  problem_id: string;
  problem_title: string;
  interviewer_id: string;
  interviewer_name: string;
  notes: string;
  problem_solving: number;
  code_quality: number;
  communication: number;
  testing_debugging: number;
  recommendation: InterviewReview["recommendation"];
  created_at: string;
  updated_at: string;
};

type SubmissionCaseRow = {
  test_case_id: string;
  passed: boolean;
  execution_time_ms: number;
  memory_kb: number;
};

export class PostgresStore implements AppStore {
  constructor(private readonly pool: Pool) {}

  async getUserById(userId: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUser>(
      `select id, name, email, role from users where id = $1`,
      [userId]
    );

    return result.rows[0] ?? null;
  }

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUser>(
      `select id, name, email, role from users where email = $1`,
      [email]
    );

    return result.rows[0] ?? null;
  }

  async listUsers(): Promise<AuthUser[]> {
    const result = await this.pool.query<AuthUser>(
      `
        select id, name, email, role
        from users
        order by role asc, name asc, email asc
      `
    );

    return result.rows;
  }

  async createUser(input: CreateUserRequest): Promise<AuthUser> {
    const userId = `${input.role}_${randomUUID()}`;

    const result = await this.pool.query<AuthUser>(
      `
        insert into users (id, name, email, role)
        values ($1, $2, $3, $4)
        returning id, name, email, role
      `,
      [userId, input.name, input.email, input.role]
    );

    return result.rows[0];
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        delete from users
        where id = $1
      `,
      [userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async hasUserReferences(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1 from problems where created_by = $1
          union all
          select 1 from assignments where candidate_id = $1 or assigned_by = $1
          union all
          select 1 from submissions where candidate_id = $1
        ) as exists
      `,
      [userId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async listCandidates(): Promise<AuthUser[]> {
    const result = await this.pool.query<AuthUser>(
      `
        select id, name, email, role
        from users
        where role = 'candidate'
        order by name asc, email asc
      `
    );

    return result.rows;
  }

  async createCandidate(input: CreateCandidateRequest): Promise<AuthUser> {
    return this.createUser({ ...input, role: "candidate" });
  }

  async listProblems(): Promise<ProblemSummary[]> {
    const result = await this.pool.query<ProblemRow>(
      `
        select
          id,
          title,
          description,
          difficulty,
          time_limit_ms,
          memory_limit_kb,
          supported_languages,
          sample_input,
          sample_output,
          created_by,
          archived_at
        from problems
        order by title asc
      `
    );

    return result.rows.map((row) => this.toProblemSummary(row));
  }

  async getProblem(problemId: string): Promise<ProblemRecord | null> {
    const problemResult = await this.pool.query<ProblemRow>(
      `
        select
          id,
          title,
          description,
          difficulty,
          time_limit_ms,
          memory_limit_kb,
          supported_languages,
          sample_input,
          sample_output,
          created_by,
          archived_at
        from problems
        where id = $1
      `,
      [problemId]
    );

    const problem = problemResult.rows[0];

    if (!problem) {
      return null;
    }

    const testCaseResult = await this.pool.query<{
      id: string;
      input: string;
      expected_output: string;
    }>(
      `
        select id, input, expected_output
        from test_cases
        where problem_id = $1 and is_hidden = true
        order by id asc
      `,
      [problemId]
    );

    const hiddenTestCases: HiddenTestCaseRecord[] = testCaseResult.rows.map((row) => ({
      id: row.id,
      input: row.input,
      expectedOutput: row.expected_output
    }));

    return {
      ...this.toProblemDetail(problem),
      hiddenTestCases,
      createdBy: problem.created_by
    };
  }

  async getProblemDetail(problemId: string): Promise<ProblemDetail | null> {
    const problem = await this.getProblem(problemId);
    return problem ? this.toProblemDetail(problem) : null;
  }

  async createProblem(input: CreateProblemRequest, createdBy: string): Promise<ProblemSummary> {
    const problemId = `problem_${randomUUID()}`;
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `
          insert into problems (
            id,
            title,
            description,
            difficulty,
            time_limit_ms,
            memory_limit_kb,
            supported_languages,
            sample_input,
            sample_output,
            created_by
          )
          values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10)
        `,
        [
          problemId,
          input.title,
          input.description,
          input.difficulty,
          input.timeLimitMs,
          input.memoryLimitKb,
          input.supportedLanguages,
          input.sampleInput,
          input.sampleOutput,
          createdBy
        ]
      );

      for (const testCase of input.hiddenTestCases ?? []) {
        await client.query(
          `
            insert into test_cases (id, problem_id, input, expected_output, is_hidden)
            values ($1, $2, $3, $4, true)
          `,
          [`case_${randomUUID()}`, problemId, testCase.input, testCase.expectedOutput]
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const problem = await this.getProblem(problemId);
    if (!problem) {
      throw new Error("failed_to_create_problem");
    }

    return this.toProblemSummary(problem);
  }

  async hasAnyAssignment(problemId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from assignments
          where problem_id = $1
        ) as exists
      `,
      [problemId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async hasAnySubmission(problemId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from submissions s
          join users u on u.id = s.candidate_id
          where s.problem_id = $1
            and u.role = 'candidate'
        ) as exists
      `,
      [problemId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async getProblemLifecycleImpact(problemId: string): Promise<ProblemLifecycleImpact | null> {
    const problem = await this.getProblem(problemId);

    if (!problem) {
      return null;
    }

    const result = await this.pool.query<{
      assignments: string;
      candidate_submissions: string;
      preview_submissions: string;
      reviews: string;
    }>(
      `
        select
          (select count(*)::text from assignments where problem_id = $1) as assignments,
          (
            select count(*)::text
            from submissions s
            join users u on u.id = s.candidate_id
            where s.problem_id = $1 and u.role = 'candidate'
          ) as candidate_submissions,
          (
            select count(*)::text
            from submissions s
            join users u on u.id = s.candidate_id
            where s.problem_id = $1 and u.role <> 'candidate'
          ) as preview_submissions,
          (select count(*)::text from interview_reviews where problem_id = $1) as reviews
      `,
      [problemId]
    );
    const row = result.rows[0];
    const assignments = Number(row?.assignments ?? 0);
    const candidateSubmissions = Number(row?.candidate_submissions ?? 0);

    return {
      problemId,
      assignments,
      candidateSubmissions,
      previewSubmissions: Number(row?.preview_submissions ?? 0),
      reviews: Number(row?.reviews ?? 0),
      canDeleteWithoutForce: assignments === 0 && candidateSubmissions === 0
    };
  }

  async archiveProblem(problemId: string, archived: boolean): Promise<ProblemSummary | null> {
    const result = await this.pool.query<ProblemRow>(
      `
        update problems
        set archived_at = ${archived ? "now()" : "null"}
        where id = $1
        returning
          id,
          title,
          description,
          difficulty,
          time_limit_ms,
          memory_limit_kb,
          supported_languages,
          sample_input,
          sample_output,
          created_by,
          archived_at
      `,
      [problemId]
    );

    return result.rows[0] ? this.toProblemSummary(result.rows[0]) : null;
  }

  async deleteProblem(problemId: string, options: { force?: boolean } = {}): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      if (options.force) {
        await client.query(`delete from assignments where problem_id = $1`, [problemId]);
        await client.query(`delete from submissions where problem_id = $1`, [problemId]);
      } else {
        await client.query(
          `
            delete from submissions s
            using users u
            where s.candidate_id = u.id
              and s.problem_id = $1
              and u.role <> 'candidate'
          `,
          [problemId]
        );
      }

      await client.query(
        `
          delete from interview_reviews
          where problem_id = $1
        `,
        [problemId]
      );

      const result = await client.query(
        `
          delete from problems
          where id = $1
        `,
        [problemId]
      );

      await client.query("commit");
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteCandidate(candidateId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        delete from users
        where id = $1 and role = 'candidate'
      `,
      [candidateId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async hasAnyAssignmentForCandidate(candidateId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from assignments
          where candidate_id = $1
        ) as exists
      `,
      [candidateId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async hasAnySubmissionByCandidate(candidateId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from submissions
          where candidate_id = $1
        ) as exists
      `,
      [candidateId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async isProblemAssigned(candidateId: string, problemId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from assignments
          where candidate_id = $1 and problem_id = $2
        ) as exists
      `,
      [candidateId, problemId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async createAssignment(candidateId: string, problemId: string, assignedBy: string): Promise<AssignmentSummary> {
    const assignmentId = `assignment_${randomUUID()}`;
    const assignedAt = new Date().toISOString();

    await this.pool.query(
      `
        insert into assignments (id, candidate_id, problem_id, assigned_by, assigned_at)
        values ($1, $2, $3, $4, $5::timestamptz)
      `,
      [assignmentId, candidateId, problemId, assignedBy, assignedAt]
    );

    const result = await this.pool.query<AssignmentRow>(
      `select id, candidate_id, problem_id, assigned_by, assigned_at from assignments where id = $1`,
      [assignmentId]
    );

    return this.toAssignmentSummary(result.rows[0]);
  }

  async hasAssignment(candidateId: string, problemId: string): Promise<boolean> {
    return this.isProblemAssigned(candidateId, problemId);
  }

  async listAssignmentsForCandidate(candidateId: string): Promise<AssignmentSummary[]> {
    const result = await this.pool.query<AssignmentRow>(
      `
        select id, candidate_id, problem_id, assigned_by, assigned_at
        from assignments
        where candidate_id = $1
        order by assigned_at asc
      `,
      [candidateId]
    );

    const summaries = await Promise.all(result.rows.map((row) => this.toAssignmentSummary(row)));
    return summaries;
  }

  async createSubmission(candidateId: string, input: CreateSubmissionRequest): Promise<SubmissionDetail> {
    const submissionId = `submission_${randomUUID()}`;
    const now = new Date().toISOString();

    await this.pool.query(
      `
        insert into submissions (
          id,
          candidate_id,
          problem_id,
          language,
          source_code,
          status,
          score,
          error_type,
          error_message,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, 'queued', null, null, null, $6::timestamptz, $6::timestamptz)
      `,
      [submissionId, candidateId, input.problemId, input.language, input.sourceCode, now]
    );

    const submission = await this.getSubmissionById(submissionId);

    if (!submission) {
      throw new Error("failed_to_create_submission");
    }

    return submission;
  }

  async createCustomRun(input: {
    candidateId: string;
    problemId: string;
    requestedBy: string;
    run: CreateCustomRunRequest;
  }): Promise<CustomRunDetail> {
    const runId = `run_${randomUUID()}`;
    const now = new Date().toISOString();

    await this.pool.query(
      `
        insert into custom_runs (
          id,
          candidate_id,
          problem_id,
          requested_by,
          language,
          source_code,
          stdin,
          status,
          stdout,
          stderr,
          error_type,
          error_message,
          execution_time_ms,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'queued', null, null, null, null, null, $8::timestamptz, $8::timestamptz)
      `,
      [
        runId,
        input.candidateId,
        input.problemId,
        input.requestedBy,
        input.run.language,
        input.run.sourceCode,
        input.run.stdin,
        now
      ]
    );

    const run = await this.getCustomRun(runId);

    if (!run) {
      throw new Error("failed_to_create_custom_run");
    }

    return run;
  }

  async getCustomRun(runId: string): Promise<CustomRunDetail | null> {
    const result = await this.pool.query<CustomRunRow>(
      `
        select
          id,
          candidate_id,
          problem_id,
          requested_by,
          language,
          source_code,
          stdin,
          status,
          stdout,
          stderr,
          error_type,
          error_message,
          execution_time_ms,
          created_at,
          updated_at
        from custom_runs
        where id = $1
      `,
      [runId]
    );

    return result.rows[0] ? this.toCustomRunDetail(result.rows[0]) : null;
  }

  async getSubmissionById(submissionId: string): Promise<SubmissionDetail | null> {
    const result = await this.pool.query<SubmissionRow>(
      `
        select
          id,
          candidate_id,
          problem_id,
          language,
          source_code,
          status,
          score,
          error_type,
          error_message,
          created_at,
          updated_at
        from submissions
        where id = $1
      `,
      [submissionId]
    );

    const submission = result.rows[0];

    if (!submission) {
      return null;
    }

    const caseResult = await this.pool.query<SubmissionCaseRow>(
      `
        select test_case_id, passed, execution_time_ms, memory_kb
        from submission_case_results
        where submission_id = $1
        order by test_case_id asc
      `,
      [submissionId]
    );

    const resultPayload =
      submission.status === "finished" || submission.status === "failed"
        ? {
            submissionId: submission.id,
            status: submission.status,
            score: submission.score ?? 0,
            cases: caseResult.rows.map((row) => ({
              testCaseId: row.test_case_id,
              passed: row.passed,
              executionTimeMs: row.execution_time_ms,
              memoryKb: row.memory_kb
            })),
            errorType: submission.error_type ?? undefined,
            errorMessage: submission.error_message ?? undefined
          }
        : null;

    return {
      id: submission.id,
      candidateId: submission.candidate_id,
      problemId: submission.problem_id,
      language: submission.language,
      sourceCode: submission.source_code,
      status: submission.status,
      score: submission.score,
      createdAt: submission.created_at,
      updatedAt: submission.updated_at,
      result: resultPayload
    };
  }

  async getSubmissionHistoryItem(submissionId: string): Promise<SubmissionHistoryItem | null> {
    const rows = await this.querySubmissionHistory([`s.id = $1`], [submissionId]);
    return rows[0] ?? null;
  }

  async listSubmissions(filters: {
    candidateId?: string;
    problemId?: string;
    candidateRole?: AuthUser["role"];
  } = {}): Promise<SubmissionHistoryItem[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.candidateId) {
      values.push(filters.candidateId);
      conditions.push(`s.candidate_id = $${values.length}`);
    }

    if (filters.problemId) {
      values.push(filters.problemId);
      conditions.push(`s.problem_id = $${values.length}`);
    }

    if (filters.candidateRole) {
      values.push(filters.candidateRole);
      conditions.push(`u.role = $${values.length}`);
    }

    return this.querySubmissionHistory(conditions, values);
  }

  async getRawSubmission(submissionId: string): Promise<SubmissionDetail | null> {
    return this.getSubmissionById(submissionId);
  }

  async updateSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus
  ): Promise<SubmissionDetail | null> {
    await this.pool.query(
      `
        update submissions
        set status = $2, updated_at = now()
        where id = $1
      `,
      [submissionId, status]
    );

    return this.getSubmissionById(submissionId);
  }

  async completeSubmission(submissionId: string, result: JudgeResult): Promise<SubmissionDetail | null> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `
          update submissions
          set
            status = $2,
            score = $3,
            error_type = $4,
            error_message = $5,
            updated_at = now()
          where id = $1
        `,
        [
          submissionId,
          result.status,
          result.score,
          result.errorType ?? null,
          result.errorMessage ?? null
        ]
      );

      await client.query(`delete from submission_case_results where submission_id = $1`, [submissionId]);

      for (const judgeCase of result.cases) {
        await client.query(
          `
            insert into submission_case_results (
              submission_id,
              test_case_id,
              passed,
              execution_time_ms,
              memory_kb
            )
            values ($1, $2, $3, $4, $5)
          `,
          [
            submissionId,
            judgeCase.testCaseId,
            judgeCase.passed,
            judgeCase.executionTimeMs,
            judgeCase.memoryKb
          ]
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return this.getSubmissionById(submissionId);
  }

  async listCandidateResults(candidateId: string): Promise<CandidateResultsResponse | null> {
    const candidate = await this.getUserById(candidateId);

    if (!candidate) {
      return null;
    }

    const submissions = await this.pool.query<
      CandidateResultItem & {
        submissionid: string;
      }
    >(
      `
        select
          s.id as "submissionId",
          s.problem_id as "problemId",
          p.title as "problemTitle",
          s.status,
          s.score,
          s.created_at as "createdAt",
          s.updated_at as "updatedAt"
        from submissions s
        join problems p on p.id = s.problem_id
        where s.candidate_id = $1
        order by s.created_at desc
      `,
      [candidateId]
    );

    return {
      candidate,
      submissions: submissions.rows
    };
  }

  async getCandidateReviewContext(candidateId: string, interviewerId: string): Promise<CandidateReviewContextResponse | null> {
    const candidate = await this.getUserById(candidateId);

    if (!candidate || candidate.role !== "candidate") {
      return null;
    }

    const [assignments, reviews] = await Promise.all([
      this.listAssignmentsForCandidate(candidateId),
      this.queryInterviewReviews(candidateId, interviewerId)
    ]);

    return {
      candidate,
      assignments,
      reviews
    };
  }

  async upsertInterviewReview(input: {
    candidateId: string;
    problemId: string;
    interviewerId: string;
    notes: string;
    problemSolving: number;
    codeQuality: number;
    communication: number;
    testingDebugging: number;
    recommendation: InterviewReview["recommendation"];
  }): Promise<InterviewReview | null> {
    const reviewId = `review_${randomUUID()}`;
    const now = new Date().toISOString();

    const result = await this.pool.query<{ id: string }>(
      `
        insert into interview_reviews (
          id,
          candidate_id,
          problem_id,
          interviewer_id,
          notes,
          problem_solving,
          code_quality,
          communication,
          testing_debugging,
          recommendation,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $11::timestamptz)
        on conflict (candidate_id, problem_id, interviewer_id)
        do update set
          notes = excluded.notes,
          problem_solving = excluded.problem_solving,
          code_quality = excluded.code_quality,
          communication = excluded.communication,
          testing_debugging = excluded.testing_debugging,
          recommendation = excluded.recommendation,
          updated_at = excluded.updated_at
        returning id
      `,
      [
        reviewId,
        input.candidateId,
        input.problemId,
        input.interviewerId,
        input.notes,
        input.problemSolving,
        input.codeQuality,
        input.communication,
        input.testingDebugging,
        input.recommendation,
        now
      ]
    );

    return this.getInterviewReviewById(result.rows[0].id);
  }

  async deleteInterviewReview(candidateId: string, problemId: string, interviewerId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        delete from interview_reviews
        where candidate_id = $1 and problem_id = $2 and interviewer_id = $3
      `,
      [candidateId, problemId, interviewerId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async getInternalStats(): Promise<InternalStats> {
    const [totalsResult, statusesResult, failuresResult, judgeCasesResult] = await Promise.all([
      this.pool.query<{
        candidates: string;
        problems: string;
        assignments: string;
        submissions: string;
      }>(
        `
          select
            (select count(*)::text from users where role = 'candidate') as candidates,
            (select count(*)::text from problems) as problems,
            (select count(*)::text from assignments) as assignments,
            (select count(*)::text from submissions) as submissions
        `
      ),
      this.pool.query<{ status: SubmissionStatus; count: string }>(
        `
          select status, count(*)::text as count
          from submissions
          group by status
        `
      ),
      this.pool.query<{ error_type: JudgeFailureType; count: string }>(
        `
          select error_type, count(*)::text as count
          from submissions
          where error_type is not null
          group by error_type
        `
      ),
      this.pool.query<{ total: string; avg_execution_time_ms: string | null }>(
        `
          select
            count(*)::text as total,
            round(avg(execution_time_ms))::text as avg_execution_time_ms
          from submission_case_results
        `
      )
    ]);

    const totalsRow = totalsResult.rows[0];
    const submissionsByStatus: Record<SubmissionStatus, number> = {
      queued: 0,
      running: 0,
      finished: 0,
      failed: 0
    };

    for (const row of statusesResult.rows) {
      submissionsByStatus[row.status] = Number(row.count);
    }

    const failuresByType: Record<JudgeFailureType, number> = {
      compile_error: 0,
      runtime_error: 0,
      time_limit_exceeded: 0,
      sandbox_error: 0,
      system_error: 0
    };

    for (const row of failuresResult.rows) {
      failuresByType[row.error_type] = Number(row.count);
    }

    const judgeCasesRow = judgeCasesResult.rows[0];

    return {
      totals: {
        candidates: Number(totalsRow?.candidates ?? 0),
        problems: Number(totalsRow?.problems ?? 0),
        assignments: Number(totalsRow?.assignments ?? 0),
        submissions: Number(totalsRow?.submissions ?? 0)
      },
      submissionsByStatus,
      failuresByType,
      judgeCases: {
        total: Number(judgeCasesRow?.total ?? 0),
        averageExecutionTimeMs: judgeCasesRow?.avg_execution_time_ms
          ? Number(judgeCasesRow.avg_execution_time_ms)
          : null
      }
    };
  }

  private async querySubmissionHistory(conditions: string[], values: unknown[]): Promise<SubmissionHistoryItem[]> {
    const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const result = await this.pool.query<SubmissionHistoryRow>(
      `
        select
          s.id,
          s.candidate_id,
          s.problem_id,
          s.language,
          s.source_code,
          s.status,
          s.score,
          s.error_type,
          s.error_message,
          s.created_at,
          s.updated_at,
          u.name as candidate_name,
          u.email as candidate_email,
          u.role as candidate_role,
          p.title as problem_title
        from submissions s
        join users u on u.id = s.candidate_id
        join problems p on p.id = s.problem_id
        ${whereClause}
        order by s.created_at desc
      `,
      values
    );

    return Promise.all(result.rows.map((row) => this.toSubmissionHistoryItem(row)));
  }

  private async toSubmissionHistoryItem(row: SubmissionHistoryRow): Promise<SubmissionHistoryItem> {
    const submission = await this.getSubmissionById(row.id);

    if (!submission) {
      throw new Error(`submission_not_found:${row.id}`);
    }

    const totalCases = submission.result?.cases.length ?? 0;
    const passedCases = submission.result?.cases.filter((testCase) => testCase.passed).length ?? 0;

    return {
      ...submission,
      candidateName: row.candidate_name,
      candidateEmail: row.candidate_email,
      candidateRole: row.candidate_role,
      problemTitle: row.problem_title,
      passedCases,
      totalCases
    };
  }

  private toCustomRunDetail(row: CustomRunRow): CustomRunDetail {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      problemId: row.problem_id,
      requestedBy: row.requested_by,
      language: row.language,
      sourceCode: row.source_code,
      stdin: row.stdin,
      status: row.status,
      stdout: row.stdout,
      stderr: row.stderr,
      errorType: row.error_type,
      errorMessage: row.error_message,
      executionTimeMs: row.execution_time_ms,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private async getInterviewReviewById(reviewId: string): Promise<InterviewReview | null> {
    const reviews = await this.queryInterviewReviewRows([`r.id = $1`], [reviewId]);
    return reviews[0] ? this.toInterviewReview(reviews[0]) : null;
  }

  private async queryInterviewReviews(candidateId: string, interviewerId: string): Promise<InterviewReview[]> {
    const rows = await this.queryInterviewReviewRows(
      [`r.candidate_id = $1`, `r.interviewer_id = $2`],
      [candidateId, interviewerId]
    );

    return rows.map((row) => this.toInterviewReview(row));
  }

  private async queryInterviewReviewRows(conditions: string[], values: unknown[]): Promise<InterviewReviewRow[]> {
    const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const result = await this.pool.query<InterviewReviewRow>(
      `
        select
          r.id,
          r.candidate_id,
          r.problem_id,
          p.title as problem_title,
          r.interviewer_id,
          u.name as interviewer_name,
          r.notes,
          r.problem_solving,
          r.code_quality,
          r.communication,
          r.testing_debugging,
          r.recommendation,
          r.created_at,
          r.updated_at
        from interview_reviews r
        join problems p on p.id = r.problem_id
        join users u on u.id = r.interviewer_id
        ${whereClause}
        order by r.updated_at desc
      `,
      values
    );

    return result.rows;
  }

  private toInterviewReview(row: InterviewReviewRow): InterviewReview {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      problemId: row.problem_id,
      problemTitle: row.problem_title,
      interviewerId: row.interviewer_id,
      interviewerName: row.interviewer_name,
      notes: row.notes,
      rubric: {
        problemSolving: row.problem_solving,
        codeQuality: row.code_quality,
        communication: row.communication,
        testingDebugging: row.testing_debugging
      },
      recommendation: row.recommendation,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private async toAssignmentSummary(assignment: AssignmentRow): Promise<AssignmentSummary> {
    const [problemResult, submissionResult] = await Promise.all([
      this.pool.query<ProblemRow>(
        `
          select
            id,
            title,
            description,
            difficulty,
            time_limit_ms,
            memory_limit_kb,
            supported_languages,
            sample_input,
            sample_output,
            created_by,
            archived_at
          from problems
          where id = $1
        `,
        [assignment.problem_id]
      ),
      this.pool.query<{ status: SubmissionStatus }>(
        `
          select status
          from submissions
          where candidate_id = $1 and problem_id = $2
          order by created_at desc
          limit 1
        `,
        [assignment.candidate_id, assignment.problem_id]
      )
    ]);

    const problem = problemResult.rows[0];
    const latestSubmission = submissionResult.rows[0];

    return {
      id: assignment.id,
      candidateId: assignment.candidate_id,
      problemId: assignment.problem_id,
      problemTitle: problem?.title ?? "Unknown problem",
      difficulty: problem?.difficulty ?? "easy",
      assignedAt: assignment.assigned_at,
      latestSubmissionStatus: latestSubmission?.status ?? null
    };
  }

  private toProblemSummary(problem: ProblemRow | ProblemRecord): ProblemSummary {
    return {
      id: problem.id,
      title: problem.title,
      difficulty: problem.difficulty,
      timeLimitMs: "time_limit_ms" in problem ? problem.time_limit_ms : problem.timeLimitMs,
      memoryLimitKb: "memory_limit_kb" in problem ? problem.memory_limit_kb : problem.memoryLimitKb,
      supportedLanguages:
        "supported_languages" in problem ? problem.supported_languages as ProblemSummary["supportedLanguages"] : problem.supportedLanguages,
      archivedAt: "archived_at" in problem ? problem.archived_at : problem.archivedAt
    };
  }

  private toProblemDetail(problem: ProblemRow | ProblemRecord): ProblemDetail {
    return {
      ...this.toProblemSummary(problem),
      description: problem.description,
      sampleInput: "sample_input" in problem ? problem.sample_input : problem.sampleInput,
      sampleOutput: "sample_output" in problem ? problem.sample_output : problem.sampleOutput
    };
  }

}
