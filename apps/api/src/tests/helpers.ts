import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type {
  CreateAssignmentResponse,
  CreateCandidateResponse,
  CreateProblemRequest,
  CreateProblemResponse,
  CreateSubmissionResponse,
  StartCandidateExamResponse,
  CreateUserResponse,
  LoginResponse,
  SubmissionDetail
} from "@oct/contracts";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";

import { buildApp } from "../app.js";
import { DEFAULT_SEED_PASSWORD } from "../core/password.js";
import type { JudgeQueue } from "../infra/judge-queue.js";
import { createPostgresPool } from "../infra/postgres.js";
import { JudgeWorker } from "../../../judge-worker/src/worker.js";
import { createPostgresPool as createWorkerPostgresPool } from "../../../judge-worker/src/postgres.js";
import { config as workerConfig } from "../../../judge-worker/src/config.js";
import { PostgresJudgeRepository } from "../../../judge-worker/src/repository.js";

export type TestPostgresConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

export type TestHarness = {
  app: FastifyInstance;
  adminPool: Pool;
  workerPool: Pool;
  dbName: string;
};

export type CreateHarnessOptions = {
  judgeQueue?: JudgeQueue;
  opsToken?: string;
  /**
   * Insert the example problems + alice assignments that used to ship in
   * `buildSeedData`. Tests that reference those fixed ids opt in explicitly
   * now that the production seed no longer provisions them.
   */
  seedExample?: boolean;
};

const basePostgresConfig = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT || 5433),
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  ssl: process.env.POSTGRES_SSL === "true"
};

const testJudgeQueue: JudgeQueue = {
  async enqueue() {},
  async ping() {}
};

export async function createHarness(options: CreateHarnessOptions = {}): Promise<TestHarness> {
  const dbName = `oct_test_${randomUUID().replaceAll("-", "_")}`;
  await createDatabase(dbName);

  const postgres: TestPostgresConfig = {
    ...basePostgresConfig,
    database: dbName
  };

  const app = await buildApp({
    postgres,
    logger: false,
    judgeQueue: options.judgeQueue ?? testJudgeQueue,
    opsToken: options.opsToken
  });
  await app.ready();

  const adminPool = createPostgresPool(postgres);

  if (options.seedExample) {
    await seedExampleData(adminPool);
  }

  return {
    app,
    adminPool,
    workerPool: createWorkerPostgresPool(postgres),
    dbName
  };
}

// Fixtures that used to live in buildSeedData's `problems`/`assignments`. They
// are inserted directly (preserving the fixed ids the tests reference) so the
// production seed can stay empty while seed-dependent tests provision their own
// preconditions via `createHarness({ seedExample: true })`.
const exampleProblems = [
  {
    id: "problem_reverse_string",
    title: "Reverse String",
    description: "Read a string and return the reversed result.",
    sampleInput: "\"cloud\"",
    sampleOutput: "\"duolc\"",
    displayNumber: 1,
    hiddenTestCases: [{ id: "case_reverse_hidden_1", input: "\"native\"", expectedOutput: "\"evitan\"" }]
  },
  {
    id: "problem_two_sum",
    title: "Two Sum",
    description:
      "Given an array of integers and a target value, return the indices of the two numbers that add up to the target.",
    sampleInput: "nums = [2, 7, 11, 15], target = 9",
    sampleOutput: "[0, 1]",
    displayNumber: 2,
    hiddenTestCases: [{ id: "case_two_sum_hidden_1", input: "nums = [3, 2, 4], target = 6", expectedOutput: "[1, 2]" }]
  }
];

const exampleAssignments = [
  {
    id: "assignment_alice_reverse_string",
    problemId: "problem_reverse_string",
    assignedAt: "2026-04-14T00:05:00.000Z"
  },
  {
    id: "assignment_alice_two_sum",
    problemId: "problem_two_sum",
    assignedAt: "2026-04-14T00:00:00.000Z"
  }
];

export async function seedExampleData(pool: Pool) {
  for (const problem of exampleProblems) {
    await pool.query(
      `
        insert into problems (
          id, title, description, difficulty, time_limit_ms, memory_limit_kb,
          supported_languages, sample_input, sample_output, created_by
        )
        values ($1, $2, $3, 'easy', 1000, 65536, $4::text[], $5, $6, 'problem_admin_cindy')
        on conflict (id) do nothing
      `,
      [problem.id, problem.title, problem.description, ["python", "cpp"], problem.sampleInput, problem.sampleOutput]
    );

    await pool.query(
      `insert into problem_display_numbers (problem_id, display_number) values ($1, $2) on conflict (problem_id) do nothing`,
      [problem.id, problem.displayNumber]
    );

    for (const testCase of problem.hiddenTestCases) {
      await pool.query(
        `insert into test_cases (id, problem_id, input, expected_output, is_hidden) values ($1, $2, $3, $4, true) on conflict (id) do nothing`,
        [testCase.id, problem.id, testCase.input, testCase.expectedOutput]
      );
    }
  }

  for (const assignment of exampleAssignments) {
    await pool.query(
      `
        insert into assignments (id, candidate_id, problem_id, assigned_by, assigned_at)
        values ($1, 'candidate_alice', $2, 'interviewer_bob', $3::timestamptz)
        on conflict (id) do nothing
      `,
      [assignment.id, assignment.problemId, assignment.assignedAt]
    );
  }
}

export async function destroyHarness(harness: TestHarness) {
  await harness.app.close();
  await harness.adminPool.end();
  await harness.workerPool.end();
  await dropDatabase(harness.dbName);
}

export async function login(app: FastifyInstance, email: string, password: string = DEFAULT_SEED_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password }
  });

  assert.equal(response.statusCode, 200);
  return response.json<LoginResponse>();
}

export function authHeader(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}

export function createWorker(pool: Pool, options?: { staleThresholdMs?: number }) {
  return new JudgeWorker(
    new PostgresJudgeRepository(pool),
    250,
    options?.staleThresholdMs ?? 30_000,
    workerConfig.sandbox
  );
}

export async function createCandidate(app: FastifyInstance, interviewerToken: string, input?: {
  name?: string;
  email?: string;
}) {
  const response = await app.inject({
    method: "POST",
    url: "/admin/candidates",
    headers: authHeader(interviewerToken),
    payload: {
      name: input?.name ?? "Test Candidate",
      email: input?.email ?? `candidate.${randomUUID()}@example.com`
    }
  });

  assert.equal(response.statusCode, 200);
  const { candidate, password } = response.json<CreateCandidateResponse>();
  return { ...candidate, password };
}

export async function createUser(app: FastifyInstance, interviewerToken: string, input?: {
  name?: string;
  email?: string;
  role?: "candidate" | "interviewer" | "problem_admin";
}) {
  const response = await app.inject({
    method: "POST",
    url: "/admin/users",
    headers: authHeader(interviewerToken),
    payload: {
      name: input?.name ?? "Test User",
      email: input?.email ?? `user.${randomUUID()}@example.com`,
      role: input?.role ?? "candidate"
    }
  });

  assert.equal(response.statusCode, 200);
  const { user, password } = response.json<CreateUserResponse>();
  return { ...user, password };
}

export async function createProblem(
  app: FastifyInstance,
  problemAdminToken: string,
  input?: Partial<CreateProblemRequest>
) {
  const response = await app.inject({
    method: "POST",
    url: "/admin/problems",
    headers: authHeader(problemAdminToken),
    payload: {
      title: input?.title ?? `Echo ${randomUUID()}`,
      description: input?.description ?? "Return the input exactly as provided.",
      difficulty: input?.difficulty ?? "easy",
      timeLimitMs: input?.timeLimitMs ?? 1000,
      memoryLimitKb: input?.memoryLimitKb ?? 65536,
      supportedLanguages: input?.supportedLanguages ?? ["python"],
      sampleInput: input?.sampleInput ?? "hello",
      sampleOutput: input?.sampleOutput ?? "hello",
      constraints: input?.constraints,
      inputSpec: input?.inputSpec,
      outputSpec: input?.outputSpec,
      sampleExplanation: input?.sampleExplanation,
      templateCode: input?.templateCode,
      hiddenTestCases: input?.hiddenTestCases ?? [
        { input: "abc", expectedOutput: "abc" },
        { input: "line two", expectedOutput: "line two" }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  return response.json<CreateProblemResponse>().problem;
}

export async function createAssignment(
  app: FastifyInstance,
  interviewerToken: string,
  candidateId: string,
  problemId: string
) {
  const response = await app.inject({
    method: "POST",
    url: "/admin/assignments",
    headers: authHeader(interviewerToken),
    payload: { candidateId, problemId }
  });

  assert.equal(response.statusCode, 200);
  return response.json<CreateAssignmentResponse>().assignment;
}

export async function createSubmission(
  app: FastifyInstance,
  candidateToken: string,
  payload: {
    problemId: string;
    language: "python" | "cpp";
    sourceCode: string;
  }
) {
  await startCandidateExam(app, candidateToken);

  const response = await app.inject({
    method: "POST",
    url: "/me/submissions",
    headers: authHeader(candidateToken),
    payload
  });

  assert.equal(response.statusCode, 200);
  return response.json<CreateSubmissionResponse>();
}

export async function startCandidateExam(app: FastifyInstance, candidateToken: string) {
  const response = await app.inject({
    method: "POST",
    url: "/me/exam/start",
    headers: authHeader(candidateToken)
  });

  assert.equal(response.statusCode, 200);
  return response.json<StartCandidateExamResponse>().exam;
}

export async function fetchSubmission(app: FastifyInstance, candidateToken: string, submissionId: string) {
  const response = await app.inject({
    method: "GET",
    url: `/me/submissions/${submissionId}`,
    headers: authHeader(candidateToken)
  });

  assert.equal(response.statusCode, 200);
  return response.json<SubmissionDetail>();
}

async function createDatabase(dbName: string) {
  const pool = new Pool({
    ...basePostgresConfig,
    database: "postgres",
    ssl: basePostgresConfig.ssl ? { rejectUnauthorized: false } : false
  });

  try {
    await pool.query(`create database ${quoteIdentifier(dbName)}`);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(dbName: string) {
  const pool = new Pool({
    ...basePostgresConfig,
    database: "postgres",
    ssl: basePostgresConfig.ssl ? { rejectUnauthorized: false } : false
  });

  try {
    await pool.query(
      `
        select pg_terminate_backend(pid)
        from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()
      `,
      [dbName]
    );
    await pool.query(`drop database if exists ${quoteIdentifier(dbName)}`);
  } finally {
    await pool.end();
  }
}

function quoteIdentifier(value: string) {
  if (!/^\w+$/.test(value)) {
    throw new Error(`invalid_identifier:${value}`);
  }

  return `"${value}"`;
}
