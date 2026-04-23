import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JudgeCaseResult, JudgeResult, SupportedLanguage } from "@oct/contracts";

type HiddenTestCase = {
  id: string;
  input: string;
  expectedOutput: string;
};

export type ExecutionSubmission = {
  submissionId: string;
  language: SupportedLanguage;
  sourceCode: string;
  timeLimitMs: number;
  hiddenTestCases: HiddenTestCase[];
};

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

const COMPILE_TIMEOUT_MS = 10_000;
const OUTPUT_LIMIT_BYTES = 64 * 1024;

export async function executeSubmission(
  submission: ExecutionSubmission
): Promise<JudgeResult> {
  const workingDirectory = await mkdtemp(join(tmpdir(), "oct-judge-"));

  try {
    const runnable = await prepareRunnable(submission.language, submission.sourceCode, workingDirectory);

    if ("compileError" in runnable) {
      return {
        submissionId: submission.submissionId,
        status: "failed",
        score: 0,
        cases: [],
        errorMessage: runnable.compileError
      };
    }

    const caseResults: JudgeCaseResult[] = [];

    for (const testCase of submission.hiddenTestCases) {
      const runResult = await runCommand(runnable.command, runnable.args, {
        cwd: workingDirectory,
        input: testCase.input,
        timeoutMs: submission.timeLimitMs
      });

      if (runResult.timedOut) {
        return {
          submissionId: submission.submissionId,
          status: "failed",
          score: 0,
          cases: caseResults,
          errorMessage: `Time limit exceeded after ${submission.timeLimitMs}ms`
        };
      }

      if (runResult.exitCode !== 0) {
        return {
          submissionId: submission.submissionId,
          status: "failed",
          score: 0,
          cases: caseResults,
          errorMessage: formatRuntimeError(runResult.stderr)
        };
      }

      caseResults.push({
        testCaseId: testCase.id,
        passed: normalizeOutput(runResult.stdout) === normalizeOutput(testCase.expectedOutput),
        executionTimeMs: runResult.durationMs,
        memoryKb: estimateMemoryKb(runResult.stdout, runResult.stderr)
      });
    }

    const passedCases = caseResults.filter((judgeCase) => judgeCase.passed).length;
    const totalCases = caseResults.length;
    const score = totalCases === 0 ? 0 : Math.round((passedCases / totalCases) * 100);

    return {
      submissionId: submission.submissionId,
      status: "finished",
      score,
      cases: caseResults
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function prepareRunnable(language: SupportedLanguage, sourceCode: string, workingDirectory: string) {
  if (language === "python") {
    const sourcePath = join(workingDirectory, "main.py");
    await writeFile(sourcePath, sourceCode, "utf8");

    return {
      command: "python3",
      args: [sourcePath]
    };
  }

  const sourcePath = join(workingDirectory, "main.cpp");
  const outputPath = join(workingDirectory, "main");

  await writeFile(sourcePath, sourceCode, "utf8");

  const compileResult = await runCommand(
    "g++",
    [sourcePath, "-std=c++17", "-O2", "-o", outputPath],
    {
      cwd: workingDirectory,
      timeoutMs: COMPILE_TIMEOUT_MS
    }
  );

  if (compileResult.timedOut) {
    return {
      compileError: `Compilation timed out after ${COMPILE_TIMEOUT_MS}ms`
    };
  }

  if (compileResult.exitCode !== 0) {
    return {
      compileError: formatCompileError(compileResult.stderr)
    };
  }

  return {
    command: outputPath,
    args: []
  };
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    input?: string;
    timeoutMs: number;
  }
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: "pipe"
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;

      if (stdoutBytes > OUTPUT_LIMIT_BYTES) {
        timedOut = true;
        child.kill("SIGKILL");
        return;
      }

      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;

      if (stderrBytes > OUTPUT_LIMIT_BYTES) {
        timedOut = true;
        child.kill("SIGKILL");
        return;
      }

      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut
      });
    });

    if (options.input) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}

function normalizeOutput(output: string) {
  return output.replace(/\r\n/g, "\n").trim();
}

function formatCompileError(stderr: string) {
  const message = stderr.trim();
  return message ? `Compile error: ${message}` : "Compile error";
}

function formatRuntimeError(stderr: string) {
  const message = stderr.trim();
  return message ? `Runtime error: ${message}` : "Runtime error";
}

function estimateMemoryKb(stdout: string, stderr: string) {
  return Math.max(1024, Math.ceil((Buffer.byteLength(stdout) + Buffer.byteLength(stderr)) / 1024));
}
