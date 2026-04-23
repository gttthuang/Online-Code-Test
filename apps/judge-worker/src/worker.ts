import type { Pool } from "pg";
import type { JudgeResult, SubmissionDetail } from "@oct/contracts";

import { executeSubmission } from "./executor.js";
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

  constructor(
    private readonly pool: Pool,
    private readonly pollIntervalMs: number,
    private readonly sandbox: typeof workerConfig.sandbox
  ) {}

  async start() {
    while (this.running) {
      let submission: ClaimedSubmission | null = null;

      try {
        submission = await this.claimNextSubmission();

        if (!submission) {
          await delay(this.pollIntervalMs);
          continue;
        }

        console.log(`claim submission ${submission.id} (${submission.language})`);

        const result = await executeSubmission({
          submissionId: submission.id,
          language: submission.language,
          sourceCode: submission.sourceCode,
          timeLimitMs: submission.timeLimitMs,
          hiddenTestCases: submission.hiddenTestCases,
          sandbox: this.sandbox
        });

        await this.completeSubmission(submission.id, result);
        console.log(`complete submission ${submission.id} -> ${result.status} (${result.score})`);
      } catch (error) {
        console.error("judge worker error", error);

        if (submission) {
          const failureResult: JudgeResult = {
            submissionId: submission.id,
            status: "failed",
            score: 0,
            cases: [],
            errorMessage: toErrorMessage(error)
          };

          try {
            await this.completeSubmission(submission.id, failureResult);
            console.log(`complete submission ${submission.id} -> failed (0)`);
          } catch (completionError) {
            console.error("failed to persist submission failure", completionError);
          }
        }

        await delay(this.pollIntervalMs);
      }
    }
  }

  stop() {
    this.running = false;
  }

  private async claimNextSubmission(): Promise<ClaimedSubmission | null> {
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
          with next_submission as (
            select s.id
            from submissions s
            where s.status = 'queued'
            order by s.created_at asc
            for update skip locked
            limit 1
          )
          update submissions s
          set status = 'running', updated_at = now()
          from next_submission n, problems p
          where s.id = n.id and p.id = s.problem_id
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
        `
      );

      if (claimed.rowCount === 0) {
        await client.query("commit");
        return null;
      }

      const submission = claimed.rows[0];

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
        [submission.problem_id]
      );

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
        hiddenTestCases: testCases.rows.map((row) => ({
          id: row.id,
          input: row.input,
          expectedOutput: row.expected_output
        }))
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
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
            error_message = $4,
            updated_at = now()
          where id = $1
        `,
        [submissionId, result.status, result.score, result.errorMessage ?? null]
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

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Judge worker failed unexpectedly";
}
