import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import type { JudgeCaseResult, JudgeResult, SupportedLanguage } from "@oct/contracts";
import { ExecutionFailure } from "./execution-failure.js";

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
  sandbox: {
    workRoot: string;
    pythonImage: string;
    cppImage: string;
    cpuLimit: string;
    memoryLimitMb: number;
    pidsLimit: number;
  };
};

export type CustomRunExecution = {
  runId: string;
  language: SupportedLanguage;
  sourceCode: string;
  stdin: string;
  timeLimitMs: number;
  sandbox: ExecutionSubmission["sandbox"];
};

export type CustomRunExecutionResult = {
  status: "finished" | "failed";
  stdout: string;
  stderr: string;
  errorType?: "compile_error" | "runtime_error" | "time_limit_exceeded" | "sandbox_error" | "system_error";
  errorMessage?: string;
  executionTimeMs: number;
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
const ensuredImages = new Set<string>();

export async function executeSubmission(
  submission: ExecutionSubmission
): Promise<JudgeResult> {
  const workRoot = resolve(process.cwd(), submission.sandbox.workRoot);
  await mkdir(workRoot, { recursive: true });

  const workingDirectory = await mkdtemp(join(workRoot, "oct-judge-"));
  await chmod(workingDirectory, 0o777);

  try {
    const runnable = await prepareRunnable(
      submission.language,
      submission.sourceCode,
      workingDirectory,
      submission.sandbox
    );

    if ("compileError" in runnable) {
      return {
        submissionId: submission.submissionId,
        status: "failed",
        score: 0,
        cases: [],
        errorType: "compile_error",
        errorMessage: runnable.compileError
      };
    }

    const caseResults: JudgeCaseResult[] = [];

    for (const testCase of submission.hiddenTestCases) {
      const runResult = await runCommand(runnable.command, runnable.args, {
        cwd: workingDirectory,
        input: testCase.input,
        timeoutMs: submission.timeLimitMs,
        sandbox: submission.sandbox
      });

      if (runResult.timedOut) {
        return {
          submissionId: submission.submissionId,
          status: "failed",
          score: 0,
          cases: caseResults,
          errorType: "time_limit_exceeded",
          errorMessage: `Time limit exceeded after ${submission.timeLimitMs}ms`
        };
      }

      if (runResult.exitCode !== 0) {
        return {
          submissionId: submission.submissionId,
          status: "failed",
          score: 0,
          cases: caseResults,
          errorType: "runtime_error",
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

export async function executeCustomRun(input: CustomRunExecution): Promise<CustomRunExecutionResult> {
  const workRoot = resolve(process.cwd(), input.sandbox.workRoot);
  await mkdir(workRoot, { recursive: true });

  const workingDirectory = await mkdtemp(join(workRoot, "oct-run-"));
  await chmod(workingDirectory, 0o777);

  try {
    const runnable = await prepareRunnable(
      input.language,
      input.sourceCode,
      workingDirectory,
      input.sandbox
    );

    if ("compileError" in runnable) {
      return {
        status: "failed",
        stdout: "",
        stderr: "",
        errorType: "compile_error",
        errorMessage: runnable.compileError,
        executionTimeMs: 0
      };
    }

    const runResult = await runCommand(runnable.command, runnable.args, {
      cwd: workingDirectory,
      input: input.stdin,
      timeoutMs: input.timeLimitMs,
      sandbox: input.sandbox
    });

    if (runResult.timedOut) {
      return {
        status: "failed",
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        errorType: "time_limit_exceeded",
        errorMessage: `Time limit exceeded after ${input.timeLimitMs}ms`,
        executionTimeMs: runResult.durationMs
      };
    }

    if (runResult.exitCode !== 0) {
      return {
        status: "failed",
        stdout: runResult.stdout,
        stderr: runResult.stderr,
        errorType: "runtime_error",
        errorMessage: formatRuntimeError(runResult.stderr),
        executionTimeMs: runResult.durationMs
      };
    }

    return {
      status: "finished",
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      executionTimeMs: runResult.durationMs
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function prepareRunnable(
  language: SupportedLanguage,
  sourceCode: string,
  workingDirectory: string,
  sandbox: ExecutionSubmission["sandbox"]
) {
  if (language === "python") {
    await ensureDockerImage(sandbox.pythonImage);
    const sourcePath = join(workingDirectory, "main.py");
    await writeFile(sourcePath, sourceCode, "utf8");
    await chmod(sourcePath, 0o666);

    const compileResult = await runCommand(
      "python3",
      [
        "-B",
        "-c",
        "import pathlib; compile(pathlib.Path('/workspace/main.py').read_text(), '/workspace/main.py', 'exec')"
      ],
      {
        cwd: workingDirectory,
        timeoutMs: COMPILE_TIMEOUT_MS,
        sandbox
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
      command: "python3",
      args: ["-B", "/workspace/main.py"]
    };
  }

  await ensureDockerImage(sandbox.cppImage);
  const sourcePath = join(workingDirectory, "main.cpp");
  await writeFile(sourcePath, sourceCode, "utf8");
  await chmod(sourcePath, 0o666);

  const compileResult = await runCommand(
    "g++",
    ["/workspace/main.cpp", "-std=c++17", "-O2", "-o", "/workspace/main"],
    {
      cwd: workingDirectory,
      timeoutMs: COMPILE_TIMEOUT_MS,
      sandbox
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
    command: "/workspace/main",
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
    sandbox: ExecutionSubmission["sandbox"];
  }
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const start = Date.now();
    const containerName = `oct-judge-${randomUUID()}`;
    const dockerArgs = buildDockerRunArgs(
      containerName,
      options.cwd,
      options.sandbox,
      command,
      args
    );
    const child = spawn("docker", dockerArgs, {
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
      void cleanupContainer(containerName);
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

async function ensureDockerImage(image: string) {
  if (ensuredImages.has(image)) {
    return;
  }

  const inspectResult = await runHostCommand("docker", ["image", "inspect", image], 15_000);

  if (inspectResult.exitCode !== 0) {
    const pullResult = await runHostCommand("docker", ["pull", image], 180_000);

    if (pullResult.exitCode !== 0) {
      throw new ExecutionFailure(
        "sandbox_error",
        `failed_to_pull_sandbox_image: ${image}${pullResult.stderr ? ` (${pullResult.stderr.trim()})` : ""}`
      );
    }
  }

  ensuredImages.add(image);
}

async function runHostCommand(command: string, args: string[], timeoutMs: number) {
  return await new Promise<CommandResult>((resolve, reject) => {
    const start = Date.now();
    const child = spawn(command, args, {
      stdio: "pipe"
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
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
  });
}

function buildDockerRunArgs(
  containerName: string,
  workingDirectory: string,
  sandbox: ExecutionSubmission["sandbox"],
  command: string,
  args: string[]
) {
  return [
    "run",
    "--rm",
    "--name",
    containerName,
    "-i",
    "--network",
    "none",
    "--cpus",
    sandbox.cpuLimit,
    "--memory",
    `${sandbox.memoryLimitMb}m`,
    "--memory-swap",
    `${sandbox.memoryLimitMb}m`,
    "--pids-limit",
    String(sandbox.pidsLimit),
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--volume",
    `${workingDirectory}:/workspace`,
    "--workdir",
    "/workspace",
    command === "python3" ? sandbox.pythonImage : sandbox.cppImage,
    command,
    ...args
  ];
}

async function cleanupContainer(containerName: string) {
  try {
    await runHostCommand("docker", ["rm", "-f", containerName], 10_000);
  } catch {
    // Best-effort cleanup after timeout.
  }
}

function normalizeOutput(output: string) {
  return output.replaceAll("\r\n", "\n").trim();
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
