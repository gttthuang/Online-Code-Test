import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildDockerRunArgs,
  executeCustomRun,
  executeSubmission
} from "../executor.js";

const sandbox = {
  workRoot: "",
  pythonImage: "python:3.13-slim",
  cppImage: "gcc:13",
  cpuLimit: "1",
  memoryLimitMb: 128,
  pidsLimit: 32
};

test("Python submissions report partial scores and clean temporary files", async () => {
  await withWorkRoot(async (workRoot) => {
    const result = await executeSubmission({
      submissionId: "submission-python",
      language: "python",
      sourceCode: "import sys\nprint(sys.stdin.read()[::-1], end='')",
      timeLimitMs: 1_000,
      hiddenTestCases: [
        { id: "case-1", input: "abc", expectedOutput: "cba" },
        { id: "case-2", input: "xyz", expectedOutput: "wrong" }
      ],
      sandbox: { ...sandbox, workRoot }
    });

    assert.equal(result.status, "finished");
    assert.equal(result.score, 50);
    assert.deepEqual(result.cases.map((item) => item.passed), [true, false]);
    assert.deepEqual(await readdir(workRoot), []);
  });
});

test("runtime errors are classified without leaking the work directory", async () => {
  await withWorkRoot(async (workRoot) => {
    const result = await executeSubmission({
      submissionId: "submission-runtime-error",
      language: "python",
      sourceCode: "raise RuntimeError('boom')",
      timeLimitMs: 1_000,
      hiddenTestCases: [
        { id: "case-1", input: "", expectedOutput: "" }
      ],
      sandbox: { ...sandbox, workRoot }
    });

    assert.equal(result.status, "failed");
    assert.equal(result.errorType, "runtime_error");
    assert.match(result.errorMessage ?? "", /boom/);
    assert.deepEqual(await readdir(workRoot), []);
  });
});

test("C++ submissions compile and execute in the sandbox", async () => {
  await withWorkRoot(async (workRoot) => {
    const result = await executeSubmission({
      submissionId: "submission-cpp",
      language: "cpp",
      sourceCode: [
        "#include <iostream>",
        "#include <string>",
        "int main() {",
        "  std::string value;",
        "  std::getline(std::cin, value);",
        "  std::cout << value;",
        "}"
      ].join("\n"),
      timeLimitMs: 1_000,
      hiddenTestCases: [
        { id: "case-1", input: "hello\n", expectedOutput: "hello" }
      ],
      sandbox: { ...sandbox, workRoot }
    });

    assert.equal(result.status, "finished");
    assert.equal(result.score, 100);
  });
});

test("custom runs preserve stdout and stderr", async () => {
  await withWorkRoot(async (workRoot) => {
    const result = await executeCustomRun({
      runId: "run-output",
      language: "python",
      sourceCode: "import sys\nprint('out')\nprint('err', file=sys.stderr)",
      stdin: "",
      timeLimitMs: 1_000,
      sandbox: { ...sandbox, workRoot }
    });

    assert.equal(result.status, "finished");
    assert.equal(result.stdout, "out\n");
    assert.equal(result.stderr, "err\n");
  });
});

test("Docker execution disables network and Linux capabilities", () => {
  const args = buildDockerRunArgs(
    "container-name",
    "/tmp/work",
    { ...sandbox, workRoot: "/tmp/work" },
    "python3",
    ["-B", "/workspace/main.py"]
  );

  assert.deepEqual(args.slice(0, 4), ["run", "--rm", "--name", "container-name"]);
  assert.ok(hasFlagValue(args, "--network", "none"));
  assert.ok(hasFlagValue(args, "--cap-drop", "ALL"));
  assert.ok(hasFlagValue(args, "--security-opt", "no-new-privileges"));
  assert.ok(hasFlagValue(args, "--pids-limit", "32"));
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("--tmpfs"));
});

async function withWorkRoot(run: (workRoot: string) => Promise<void>) {
  const workRoot = await mkdtemp(join(tmpdir(), "oct-worker-test-"));

  try {
    await run(workRoot);
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

function hasFlagValue(args: string[], flag: string, expectedValue: string) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] === expectedValue;
}
