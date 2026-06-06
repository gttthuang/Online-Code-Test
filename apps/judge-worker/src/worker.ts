import type { JudgeFailureType, JudgeResult } from "@oct/contracts";

import type { config as workerConfig } from "./config.js";
import {
  executeCustomRun,
  executeSubmission,
  type CustomRunExecutionResult,
  type CustomRunExecution,
  type ExecutionSubmission
} from "./executor.js";
import { ExecutionFailure } from "./execution-failure.js";
import { logError, logInfo } from "./logger.js";
import type {
  ClaimedCustomRun,
  ClaimedSubmission,
  JudgeRepository
} from "./repository.js";

export type JudgeExecutors = {
  executeSubmission(input: ExecutionSubmission): Promise<JudgeResult>;
  executeCustomRun(input: CustomRunExecution): Promise<CustomRunExecutionResult>;
};

const defaultExecutors: JudgeExecutors = {
  executeSubmission,
  executeCustomRun
};

export class JudgeWorker {
  private lastRecoveryAt = 0;

  constructor(
    private readonly repository: JudgeRepository,
    private readonly heartbeatIntervalMs: number,
    private readonly staleThresholdMs: number,
    private readonly sandbox: typeof workerConfig.sandbox,
    private readonly executors: JudgeExecutors = defaultExecutors
  ) {}

  async processSubmissionById(submissionId: string) {
    await this.maybeRecoverStaleSubmissions();
    const submission = await this.repository.claimSubmissionById(submissionId);

    if (!submission) {
      return false;
    }

    await this.processClaimedSubmission(submission);
    return true;
  }

  async processCustomRunById(runId: string) {
    await this.maybeRecoverStaleRuns();
    const run = await this.repository.claimCustomRunById(runId);

    if (!run) {
      return false;
    }

    await this.processClaimedCustomRun(run);
    return true;
  }

  async runRecoveryPass() {
    const [submissionIds, customRunIds] = await Promise.all([
      this.recoverStaleSubmissions(),
      this.recoverStaleCustomRuns()
    ]);

    return {
      submissionIds,
      customRunIds
    };
  }

  listQueuedSubmissionIds(limit = 100) {
    return this.repository.listQueuedSubmissionIds(limit);
  }

  listQueuedCustomRunIds(limit = 100) {
    return this.repository.listQueuedCustomRunIds(limit);
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

      const result = await this.executors.executeSubmission({
        submissionId: submission.id,
        language: submission.language,
        sourceCode: submission.sourceCode,
        timeLimitMs: submission.timeLimitMs,
        hiddenTestCases: submission.hiddenTestCases,
        sandbox: this.sandbox
      });

      stopHeartbeat();
      await this.repository.completeSubmission(submission.id, result);
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
        await this.repository.completeSubmission(submission.id, failureResult);
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

  private async processClaimedCustomRun(run: ClaimedCustomRun) {
    const startedAt = Date.now();

    try {
      logInfo("custom_run_claimed", {
        runId: run.id,
        candidateId: run.candidateId,
        problemId: run.problemId,
        language: run.language
      });

      const result = await this.executors.executeCustomRun({
        runId: run.id,
        language: run.language,
        sourceCode: run.sourceCode,
        stdin: run.stdin,
        timeLimitMs: run.timeLimitMs,
        sandbox: this.sandbox
      });

      await this.repository.completeCustomRun(run.id, result);
      logInfo("custom_run_completed", {
        runId: run.id,
        candidateId: run.candidateId,
        problemId: run.problemId,
        language: run.language,
        status: result.status,
        errorType: result.errorType ?? null,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      try {
        await this.repository.completeCustomRun(run.id, {
          status: "failed",
          stdout: "",
          stderr: "",
          errorType: toFailureType(error),
          errorMessage: toErrorMessage(error),
          executionTimeMs: Date.now() - startedAt
        });
      } catch (completionError) {
        logError("custom_run_failure_persist_error", {
          runId: run.id,
          message: toErrorMessage(completionError)
        });
      }

      throw error;
    }
  }

  private startHeartbeat(submissionId: string) {
    const timer = setInterval(() => {
      void this.repository.touchRunningSubmission(submissionId).catch((error) => {
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

  private async maybeRecoverStaleSubmissions() {
    const now = Date.now();

    if (now - this.lastRecoveryAt < this.staleThresholdMs) {
      return [];
    }

    return this.recoverStaleSubmissions();
  }

  private async maybeRecoverStaleRuns() {
    const now = Date.now();

    if (now - this.lastRecoveryAt < this.staleThresholdMs) {
      return [];
    }

    return this.recoverStaleCustomRuns();
  }

  private async recoverStaleSubmissions() {
    this.lastRecoveryAt = Date.now();
    const ids = await this.repository.recoverStaleSubmissions(this.staleThresholdMs);

    if (ids.length > 0) {
      logInfo("stale_submissions_recovered", {
        count: ids.length
      });
    }

    return ids;
  }

  private async recoverStaleCustomRuns() {
    this.lastRecoveryAt = Date.now();
    const ids = await this.repository.recoverStaleCustomRuns(this.staleThresholdMs);

    if (ids.length > 0) {
      logInfo("stale_custom_runs_recovered", {
        count: ids.length
      });
    }

    return ids;
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
