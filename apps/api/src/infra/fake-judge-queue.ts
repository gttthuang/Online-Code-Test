import type { JudgeCaseResult, JudgeJob, JudgeResult } from "@oct/contracts";

import type { AppStore } from "./store.js";

export class FakeJudgeQueue {
  constructor(private readonly store: AppStore) {}

  enqueue(job: JudgeJob) {
    setTimeout(async () => {
      await this.store.updateSubmissionStatus(job.submissionId, "running");
    }, 150);

    setTimeout(async () => {
      const submission = await this.store.getRawSubmission(job.submissionId);
      const problem = await this.store.getProblem(job.problemId);

      if (!submission || !problem) {
        return;
      }

      const result = buildFakeJudgeResult(
        job.submissionId,
        submission.sourceCode,
        problem.hiddenTestCases.map((testCase) => testCase.id)
      );

      await this.store.completeSubmission(job.submissionId, result);
    }, 900);
  }
}

function buildFakeJudgeResult(
  submissionId: string,
  sourceCode: string,
  hiddenCaseIds: string[]
): JudgeResult {
  const source = sourceCode.toLowerCase();

  if (source.includes("compile_error")) {
    return {
      submissionId,
      status: "failed",
      score: 0,
      cases: [],
      errorMessage: "Compile error simulated by fake judge"
    };
  }

  if (source.includes("runtime_error")) {
    return {
      submissionId,
      status: "failed",
      score: 0,
      cases: [],
      errorMessage: "Runtime error simulated by fake judge"
    };
  }

  const passed = !source.includes("wrong_answer");
  const cases = createCaseResults(hiddenCaseIds, passed);

  return {
    submissionId,
    status: "finished",
    score: passed ? 100 : 0,
    cases
  };
}

function createCaseResults(hiddenCaseIds: string[], passed: boolean): JudgeCaseResult[] {
  const caseIds = hiddenCaseIds.length > 0 ? hiddenCaseIds : ["case_default_hidden"];

  return caseIds.map((testCaseId, index) => ({
    testCaseId,
    passed,
    executionTimeMs: 20 + index * 5,
    memoryKb: 1024 + index * 64
  }));
}
