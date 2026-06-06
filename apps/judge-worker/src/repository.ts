import type {
  CustomRunDetail,
  JudgeFailureType,
  JudgeResult,
  SubmissionDetail
} from "@oct/contracts";
import type { Pool, PoolClient } from "pg";

import type { CustomRunExecutionResult } from "./executor.js";

export type ClaimedSubmission = SubmissionDetail & {
  timeLimitMs: number;
  hiddenTestCases: Array<{
    id: string;
    input: string;
    expectedOutput: string;
  }>;
};

export type ClaimedCustomRun = CustomRunDetail & {
  timeLimitMs: number;
};

export interface JudgeRepository {
  claimSubmissionById(submissionId: string): Promise<ClaimedSubmission | null>;
  claimCustomRunById(runId: string): Promise<ClaimedCustomRun | null>;
  listQueuedSubmissionIds(limit?: number): Promise<string[]>;
  listQueuedCustomRunIds(limit?: number): Promise<string[]>;
  touchRunningSubmission(submissionId: string): Promise<void>;
  recoverStaleSubmissions(staleThresholdMs: number): Promise<string[]>;
  recoverStaleCustomRuns(staleThresholdMs: number): Promise<string[]>;
  completeSubmission(submissionId: string, result: JudgeResult): Promise<void>;
  completeCustomRun(runId: string, result: CustomRunExecutionResult): Promise<void>;
}

export class PostgresJudgeRepository implements JudgeRepository {
  constructor(private readonly pool: Pool) {}

  async claimSubmissionById(submissionId: string): Promise<ClaimedSubmission | null> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const claimed = await client.query<{
        id: string;
        candidate_id: string;
        problem_id: string;
        language: SubmissionDetail["language"];
        source_code: string;
        status: SubmissionDetail["status"];
        score: number | null;
        time_limit_ms: number;
        created_at: string;
        updated_at: string;
      }>(
        `
          update submissions s
          set status = 'running', updated_at = now()
          from problems p
          where s.id = $1 and s.status = 'queued' and p.id = s.problem_id
          returning
            s.id,
            s.candidate_id,
            s.problem_id,
            s.language,
            s.source_code,
            s.status,
            s.score,
            p.time_limit_ms,
            s.created_at,
            s.updated_at
        `,
        [submissionId]
      );

      if (claimed.rowCount === 0) {
        await client.query("commit");
        return null;
      }

      const submission = claimed.rows[0];
      const testCases = await this.fetchHiddenTestCases(client, submission.problem_id);

      await client.query("commit");

      return {
        id: submission.id,
        candidateId: submission.candidate_id,
        problemId: submission.problem_id,
        language: submission.language,
        sourceCode: submission.source_code,
        status: submission.status,
        score: submission.score,
        timeLimitMs: submission.time_limit_ms,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
        result: null,
        hiddenTestCases: testCases
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async claimCustomRunById(runId: string): Promise<ClaimedCustomRun | null> {
    const result = await this.pool.query<{
      id: string;
      candidate_id: string;
      problem_id: string;
      requested_by: string;
      language: CustomRunDetail["language"];
      source_code: string;
      stdin: string;
      status: CustomRunDetail["status"];
      stdout: string | null;
      stderr: string | null;
      error_type: JudgeFailureType | null;
      error_message: string | null;
      execution_time_ms: number | null;
      time_limit_ms: number;
      created_at: string;
      updated_at: string;
    }>(
      `
        update custom_runs cr
        set status = 'running', updated_at = now()
        from problems p
        where cr.id = $1 and cr.status = 'queued' and p.id = cr.problem_id
        returning
          cr.id,
          cr.candidate_id,
          cr.problem_id,
          cr.requested_by,
          cr.language,
          cr.source_code,
          cr.stdin,
          cr.status,
          cr.stdout,
          cr.stderr,
          cr.error_type,
          cr.error_message,
          cr.execution_time_ms,
          p.time_limit_ms,
          cr.created_at,
          cr.updated_at
      `,
      [runId]
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

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
      timeLimitMs: row.time_limit_ms,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async listQueuedSubmissionIds(limit = 100) {
    const result = await this.pool.query<{ id: string }>(
      `
        select id
        from submissions
        where status = 'queued'
        order by created_at asc
        limit $1
      `,
      [limit]
    );

    return result.rows.map((row) => row.id);
  }

  async listQueuedCustomRunIds(limit = 100) {
    const result = await this.pool.query<{ id: string }>(
      `
        select id
        from custom_runs
        where status = 'queued'
        order by created_at asc
        limit $1
      `,
      [limit]
    );

    return result.rows.map((row) => row.id);
  }

  async touchRunningSubmission(submissionId: string) {
    await this.pool.query(
      `
        update submissions
        set updated_at = now()
        where id = $1 and status = 'running'
      `,
      [submissionId]
    );
  }

  async recoverStaleSubmissions(staleThresholdMs: number) {
    const result = await this.pool.query<{ id: string }>(
      `
        update submissions
        set
          status = 'queued',
          score = null,
          error_type = null,
          error_message = null,
          updated_at = now()
        where
          status = 'running'
          and updated_at < now() - ($1::bigint * interval '1 millisecond')
        returning id
      `,
      [staleThresholdMs]
    );

    return result.rows.map((row) => row.id);
  }

  async recoverStaleCustomRuns(staleThresholdMs: number) {
    const result = await this.pool.query<{ id: string }>(
      `
        update custom_runs
        set
          status = 'queued',
          stdout = null,
          stderr = null,
          error_type = null,
          error_message = null,
          execution_time_ms = null,
          updated_at = now()
        where
          status = 'running'
          and updated_at < now() - ($1::bigint * interval '1 millisecond')
        returning id
      `,
      [staleThresholdMs]
    );

    return result.rows.map((row) => row.id);
  }

  async completeSubmission(submissionId: string, result: JudgeResult) {
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
  }

  async completeCustomRun(runId: string, result: CustomRunExecutionResult) {
    await this.pool.query(
      `
        update custom_runs
        set
          status = $2,
          stdout = $3,
          stderr = $4,
          error_type = $5,
          error_message = $6,
          execution_time_ms = $7,
          updated_at = now()
        where id = $1
      `,
      [
        runId,
        result.status,
        result.stdout,
        result.stderr,
        result.errorType ?? null,
        result.errorMessage ?? null,
        result.executionTimeMs
      ]
    );
  }

  private async fetchHiddenTestCases(client: PoolClient, problemId: string) {
    const testCases = await client.query<{
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

    return testCases.rows.map((row) => ({
      id: row.id,
      input: row.input,
      expectedOutput: row.expected_output
    }));
  }
}
