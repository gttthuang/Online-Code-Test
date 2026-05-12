import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type {
  CreateAssignmentResponse,
  CreateCandidateResponse,
  CreateProblemRequest,
  CreateProblemResponse,
  CreateSubmissionResponse,
  LoginResponse,
  SubmissionDetail
} from "@oct/contracts";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";

import { buildApp } from "../app.js";
import { createPostgresPool } from "../infra/postgres.js";
import { JudgeWorker } from "../../../judge-worker/src/worker.js";
import { createPostgresPool as createWorkerPostgresPool } from "../../../judge-worker/src/postgres.js";
import { config as workerConfig } from "../../../judge-worker/src/config.js";

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

const basePostgresConfig = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT || 5433),
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  ssl: process.env.POSTGRES_SSL === "true"
};

export async function createHarness(): Promise<TestHarness> {
  const dbName = `oct_test_${randomUUID().replaceAll("-", "_")}`;
  await createDatabase(dbName);

  const postgres: TestPostgresConfig = {
    ...basePostgresConfig,
    database: dbName
  };

  const app = await buildApp({
    postgres,
    logger: false
  });
  await app.ready();

  return {
    app,
    adminPool: createPostgresPool(postgres),
    workerPool: createWorkerPostgresPool(postgres),
    dbName
  };
}

export async function destroyHarness(harness: TestHarness) {
  await harness.app.close();
  await harness.adminPool.end();
  await harness.workerPool.end();
  await dropDatabase(harness.dbName);
}

export async function login(app: FastifyInstance, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email }
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
    pool,
    25,
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
  return response.json<CreateCandidateResponse>().candidate;
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
  const response = await app.inject({
    method: "POST",
    url: "/me/submissions",
    headers: authHeader(candidateToken),
    payload
  });

  assert.equal(response.statusCode, 200);
  return response.json<CreateSubmissionResponse>();
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
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`invalid_identifier:${value}`);
  }

  return `"${value}"`;
}
