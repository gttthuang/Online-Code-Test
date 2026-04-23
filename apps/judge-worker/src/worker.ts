import type { Pool } from "pg";
import type { SubmissionDetail } from "@oct/contracts";

import { buildFakeJudgeResult } from "./fake-judge.js";

type ClaimedSubmission = SubmissionDetail & {
  hiddenCaseIds: string[];
};

export class JudgeWorker {
  private running = true;

  constructor(
    private readonly pool: Pool,
    private readonly pollIntervalMs: number
  ) {}

  async start() {
    while (this.running) {
      const submission = await this.claimNextSubmission();

      if (!submission) {
        await delay(this.pollIntervalMs);
        continue;
      }

      console.log(`claim submission ${submission.id} (${submission.language})`);

      const result = buildFakeJudgeResult(
        submission.id,
        submission.sourceCode,
        submission.hiddenCaseIds
      );

      await this.completeSubmission(submission.id, result);
      console.log(`complete submission ${submission.id} -> ${result.status} (${result.score})`);
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
        created_at: string;
        updated_at: string;
      }>(
        `
          with next_submission as (
            select id
            from submissions
            where status = 'queued'
            order by created_at asc
            for update skip locked
            limit 1
          )
          update submissions s
          set status = 'running', updated_at = now()
          from next_submission n
          where s.id = n.id
          returning
            s.id,
            s.candidate_id,
            s.problem_id,
            s.language,
            s.source_code,
            s.status,
            s.score,
            s.created_at,
            s.updated_at
        `
      );

      if (claimed.rowCount === 0) {
        await client.query("commit");
        return null;
      }

      const submission = claimed.rows[0];

      const testCases = await client.query<{ id: string }>(
        `
          select id
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
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
        result: null,
        hiddenCaseIds: testCases.rows.map((row) => row.id)
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
    result: ReturnType<typeof buildFakeJudgeResult>
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
