import type { Pool, PoolClient } from "pg";
import type { JudgeFailureType, JudgeResult, SubmissionDetail } from "@oct/contracts";

import { executeSubmission } from "./executor.js";
import { ExecutionFailure } from "./execution-failure.js";
import { logError, logInfo } from "./logger.js";
import type { config as workerConfig } from "./config.js";

type ClaimedSubmission = SubmissionDetail & {
  timeLimitMs: number;
  hiddenTestCases: Array<{
    id: string;
    input: string;
    expectedOutput: string;
  }>;
};

export class JudgeWorker {
  private running = true;
  private lastRecoveryAt = 0;

  constructor(
    private readonly pool: Pool,
    private readonly heartbeatIntervalMs: number,
    private readonly staleThresholdMs: number,
    private readonly sandbox: typeof workerConfig.sandbox
  ) {}

  async processSubmissionById(submissionId: string) {
    await this.maybeRecoverStaleSubmissions();

    const submission = await this.claimSubmissionById(submissionId);

    if (!submission) {
      return false;
    }

    await this.processClaimedSubmission(submission);
    return true;
  }

  stop() {
    this.running = false;
  }

  async runRecoveryPass() {
    return this.recoverStaleSubmissions();
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

  private async processClaimedSubmission(submission: ClaimedSubmission) {
    let stopHeartbeat = () => {};

    try {
      logInfo("submission_claimed", {
        submissionId: submission.id,
        candidateId: submission.candidateId,
        problemId: submission.problemId,
        language: submission.language
      });
      stopHeartbeat = this.startHeartbeat(submission.id);
      const startedAt = Date.now();

      const result = await executeSubmission({
        submissionId: submission.id,
        language: submission.language,
        sourceCode: submission.sourceCode,
        timeLimitMs: submission.timeLimitMs,
        hiddenTestCases: submission.hiddenTestCases,
        sandbox: this.sandbox
      });

      stopHeartbeat();
      await this.completeSubmission(submission.id, result);
      logInfo("submission_completed", {
        submissionId: submission.id,
        candidateId: submission.candidateId,
        problemId: submission.problemId,
        language: submission.language,
        status: result.status,
        score: result.score,
        errorType: result.errorType ?? null,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      stopHeartbeat();

      const failureResult: JudgeResult = {
        submissionId: submission.id,
        status: "failed",
        score: 0,
        cases: [],
        errorType: toFailureType(error),
        errorMessage: toErrorMessage(error)
      };

      try {
        await this.completeSubmission(submission.id, failureResult);
        logError("submission_failed", {
          submissionId: submission.id,
          candidateId: submission.candidateId,
          problemId: submission.problemId,
          language: submission.language,
          score: 0,
          errorType: failureResult.errorType ?? null,
          message: failureResult.errorMessage ?? null
        });
      } catch (completionError) {
        logError("submission_failure_persist_error", {
          submissionId: submission.id,
          message: toErrorMessage(completionError)
        });
      }

      throw error;
    }
  }

  private async claimSubmissionById(submissionId: string): Promise<ClaimedSubmission | null> {
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

  private startHeartbeat(submissionId: string) {
    const timer = setInterval(() => {
      void this.touchRunningSubmission(submissionId).catch((error) => {
        logError("submission_heartbeat_error", {
          submissionId,
          message: toErrorMessage(error)
        });
      });
    }, this.heartbeatIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }

  private async touchRunningSubmission(submissionId: string) {
    await this.pool.query(
      `
        update submissions
        set updated_at = now()
        where id = $1 and status = 'running'
      `,
      [submissionId]
    );
  }

  private async maybeRecoverStaleSubmissions() {
    const now = Date.now();

    if (now - this.lastRecoveryAt < this.staleThresholdMs) {
      return [];
    }

    return this.recoverStaleSubmissions();
  }

  private async recoverStaleSubmissions() {
    this.lastRecoveryAt = Date.now();

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
      [this.staleThresholdMs]
    );

    if ((result.rowCount ?? 0) > 0) {
      logInfo("stale_submissions_recovered", {
        count: result.rowCount
      });
    }

    return result.rows.map((row) => row.id);
  }

  private async completeSubmission(
    submissionId: string,
    result: JudgeResult
  ) {
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
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Judge worker failed unexpectedly";
}

function toFailureType(error: unknown): JudgeFailureType {
  if (error instanceof ExecutionFailure) {
    return error.type;
  }

  return "system_error";
}
