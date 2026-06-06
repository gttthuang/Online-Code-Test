import assert from "node:assert/strict";
import test from "node:test";

import type { JudgeResult } from "@oct/contracts";

import { ExecutionFailure } from "../execution-failure.js";
import type {
  ClaimedCustomRun,
  ClaimedSubmission,
  JudgeRepository
} from "../repository.js";
import { JudgeWorker, type JudgeExecutors } from "../worker.js";

const sandbox = {
  workRoot: ".judge-work",
  pythonImage: "python:3.13-slim",
  cppImage: "gcc:13",
  cpuLimit: "1",
  memoryLimitMb: 256,
  pidsLimit: 64
};

const successfulSubmissionResult: JudgeResult = {
  submissionId: "submission-1",
  status: "finished",
  score: 100,
  cases: []
};

function createSubmission(): ClaimedSubmission {
  return {
    id: "submission-1",
    candidateId: "candidate-1",
    problemId: "problem-1",
    language: "python",
    sourceCode: "print(input())",
    status: "running",
    score: null,
    result: null,
    attemptId: "attempt-1",
    timeLimitMs: 1_000,
    hiddenTestCases: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createCustomRun(): ClaimedCustomRun {
  return {
    id: "run-1",
    candidateId: "candidate-1",
    problemId: "problem-1",
    requestedBy: "candidate-1",
    language: "python",
    sourceCode: "print(input())",
    stdin: "hello",
    status: "running",
    stdout: null,
    stderr: null,
    errorType: null,
    errorMessage: null,
    executionTimeMs: null,
    attemptId: "attempt-1",
    timeLimitMs: 1_000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

class FakeRepository implements JudgeRepository {
  submission: ClaimedSubmission | null = createSubmission();
  customRun: ClaimedCustomRun | null = createCustomRun();
  submissionTouches: Array<{ id: string; attemptId: string }> = [];
  customRunTouches: Array<{ id: string; attemptId: string }> = [];
  submissionResults: JudgeResult[] = [];
  customRunResults: Array<{ status: string; errorType?: string }> = [];
  submissionCompletionResult = true;
  customRunCompletionResult = true;
  failSubmissionCompletion = false;
  submissionRecoveries = 0;
  customRunRecoveries = 0;

  async claimSubmissionById() {
    const submission = this.submission;
    this.submission = null;
    return submission;
  }

  async claimCustomRunById() {
    const run = this.customRun;
    this.customRun = null;
    return run;
  }

  async listQueuedSubmissionIds() {
    return [];
  }

  async listQueuedCustomRunIds() {
    return [];
  }

  async touchRunningSubmission(id: string, attemptId: string) {
    this.submissionTouches.push({ id, attemptId });
  }

  async touchRunningCustomRun(id: string, attemptId: string) {
    this.customRunTouches.push({ id, attemptId });
  }

  async recoverStaleSubmissions() {
    this.submissionRecoveries += 1;
    return [];
  }

  async recoverStaleCustomRuns() {
    this.customRunRecoveries += 1;
    return [];
  }

  async completeSubmission(_id: string, _attemptId: string, result: JudgeResult) {
    if (this.failSubmissionCompletion) {
      throw new Error("database unavailable");
    }

    this.submissionResults.push(result);
    return this.submissionCompletionResult;
  }

  async completeCustomRun(
    _id: string,
    _attemptId: string,
    result: { status: "finished" | "failed"; errorType?: string }
  ) {
    this.customRunResults.push(result);
    return this.customRunCompletionResult;
  }
}

function createExecutors(overrides: Partial<JudgeExecutors> = {}): JudgeExecutors {
  return {
    async executeSubmission() {
      return successfulSubmissionResult;
    },
    async executeCustomRun() {
      return {
        status: "finished",
        stdout: "hello\n",
        stderr: "",
        executionTimeMs: 1
      };
    },
    ...overrides
  };
}

test("only one delivery can claim and execute the same submission", async () => {
  const repository = new FakeRepository();
  let executions = 0;
  const worker = new JudgeWorker(repository, 100, 30_000, sandbox, createExecutors({
    async executeSubmission() {
      executions += 1;
      return successfulSubmissionResult;
    }
  }));

  assert.equal(await worker.processSubmissionById("submission-1"), true);
  assert.equal(await worker.processSubmissionById("submission-1"), false);
  assert.equal(executions, 1);
  assert.equal(repository.submissionResults.length, 1);
});

test("executor failures become final judge results without failing the queue job", async () => {
  const repository = new FakeRepository();
  const worker = new JudgeWorker(repository, 100, 30_000, sandbox, createExecutors({
    async executeSubmission() {
      throw new ExecutionFailure("sandbox_error", "docker daemon unavailable");
    }
  }));

  assert.equal(await worker.processSubmissionById("submission-1"), true);
  assert.equal(repository.submissionResults.length, 1);
  assert.equal(repository.submissionResults[0].status, "failed");
  assert.equal(repository.submissionResults[0].errorType, "sandbox_error");
});

test("persistence failures reject so BullMQ can retry", async () => {
  const repository = new FakeRepository();
  repository.failSubmissionCompletion = true;
  const worker = new JudgeWorker(repository, 100, 30_000, sandbox, createExecutors());

  await assert.rejects(
    worker.processSubmissionById("submission-1"),
    /database unavailable/
  );
});

test("custom runs heartbeat while executing and stop after completion", async () => {
  const repository = new FakeRepository();
  let resolveExecution!: (value: {
    status: "finished";
    stdout: string;
    stderr: string;
    executionTimeMs: number;
  }) => void;
  const execution = new Promise<{
    status: "finished";
    stdout: string;
    stderr: string;
    executionTimeMs: number;
  }>((resolve) => {
    resolveExecution = resolve;
  });
  const worker = new JudgeWorker(repository, 5, 30_000, sandbox, createExecutors({
    async executeCustomRun() {
      return execution;
    }
  }));

  const processing = worker.processCustomRunById("run-1");
  await delay(25);
  assert.ok(repository.customRunTouches.length >= 2);

  resolveExecution({
    status: "finished",
    stdout: "hello\n",
    stderr: "",
    executionTimeMs: 1
  });
  await processing;

  const touchesAfterCompletion = repository.customRunTouches.length;
  await delay(20);
  assert.equal(repository.customRunTouches.length, touchesAfterCompletion);
});

test("submission and custom-run recovery throttles are independent", async () => {
  const repository = new FakeRepository();
  repository.submission = null;
  repository.customRun = null;
  const worker = new JudgeWorker(repository, 100, 30_000, sandbox, createExecutors());

  await worker.processSubmissionById("missing-submission");
  await worker.processCustomRunById("missing-run");

  assert.equal(repository.submissionRecoveries, 1);
  assert.equal(repository.customRunRecoveries, 1);
});

test("results from superseded leases are discarded", async () => {
  const repository = new FakeRepository();
  repository.submissionCompletionResult = false;
  const worker = new JudgeWorker(repository, 100, 30_000, sandbox, createExecutors());

  assert.equal(await worker.processSubmissionById("submission-1"), true);
  assert.equal(repository.submissionResults.length, 1);
});

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
