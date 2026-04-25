import { buildSeedData } from "./seed.js";
import type { Pool } from "pg";

export async function initializePostgres(pool: Pool) {
  await waitForPostgres(pool);

  await pool.query(`
    create table if not exists users (
      id text primary key,
      name text not null,
      email text not null unique,
      role text not null
    );

    create table if not exists problems (
      id text primary key,
      title text not null,
      description text not null,
      difficulty text not null,
      time_limit_ms integer not null,
      memory_limit_kb integer not null,
      supported_languages text[] not null,
      sample_input text not null,
      sample_output text not null,
      created_by text not null references users(id)
    );

    create table if not exists test_cases (
      id text primary key,
      problem_id text not null references problems(id) on delete cascade,
      input text not null,
      expected_output text not null,
      is_hidden boolean not null default true
    );

    create table if not exists assignments (
      id text primary key,
      candidate_id text not null references users(id),
      problem_id text not null references problems(id),
      assigned_by text not null references users(id),
      assigned_at timestamptz not null
    );

    create table if not exists submissions (
      id text primary key,
      candidate_id text not null references users(id),
      problem_id text not null references problems(id),
      language text not null,
      source_code text not null,
      status text not null,
      score integer,
      error_message text,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create table if not exists submission_case_results (
      submission_id text not null references submissions(id) on delete cascade,
      test_case_id text not null,
      passed boolean not null,
      execution_time_ms integer not null,
      memory_kb integer not null,
      primary key (submission_id, test_case_id)
    );
  `);

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

async function waitForPostgres(pool: Pool) {
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      await delay(1_000);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
