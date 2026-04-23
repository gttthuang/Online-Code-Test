import type { JudgeCaseResult, JudgeResult } from "@oct/contracts";

export function buildFakeJudgeResult(
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
      errorMessage: "Compile error simulated by fake judge worker"
    };
  }

  if (source.includes("runtime_error")) {
    return {
      submissionId,
      status: "failed",
      score: 0,
      cases: [],
      errorMessage: "Runtime error simulated by fake judge worker"
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
