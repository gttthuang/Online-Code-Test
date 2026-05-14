import type { Pool } from "pg";

import { buildSeedData } from "./seed.js";

export async function seedPostgres(pool: Pool) {
  const seed = buildSeedData();

  for (const user of seed.users) {
    await pool.query(
      `
        insert into users (id, name, email, role)
        values ($1, $2, $3, $4)
        on conflict (id) do nothing
      `,
      [user.id, user.name, user.email, user.role]
    );
  }

  for (const problem of seed.problems) {
    await pool.query(
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
        on conflict (id) do nothing
      `,
      [
        problem.id,
        problem.title,
        problem.description,
        problem.difficulty,
        problem.timeLimitMs,
        problem.memoryLimitKb,
        problem.supportedLanguages,
        problem.sampleInput,
        problem.sampleOutput,
        problem.createdBy
      ]
    );

    for (const testCase of problem.hiddenTestCases) {
      await pool.query(
        `
          insert into test_cases (id, problem_id, input, expected_output, is_hidden)
          values ($1, $2, $3, $4, true)
          on conflict (id) do nothing
        `,
        [testCase.id, problem.id, testCase.input, testCase.expectedOutput]
      );
    }
  }

  for (const assignment of seed.assignments) {
    await pool.query(
      `
        insert into assignments (id, candidate_id, problem_id, assigned_by, assigned_at)
        values ($1, $2, $3, $4, $5::timestamptz)
        on conflict (id) do nothing
      `,
      [
        assignment.id,
        assignment.candidateId,
        assignment.problemId,
        assignment.assignedBy,
        assignment.assignedAt
      ]
    );
  }
}
