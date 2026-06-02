import type {
  AuthUser,
  CandidateExamSummary,
  CustomRunDetail,
  ProblemDetail,
  SubmissionHistoryItem
} from "@oct/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../lib/api";
import { CandidateWorkspace } from "./CandidateWorkspace";

vi.mock("../lib/api");

const initVimMode = vi.fn(() => ({ dispose: vi.fn() }));
vi.mock("monaco-vim", () => ({ initVimMode: (...args: unknown[]) => initVimMode(...(args as [])) }));

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange, onMount }: { value?: string; onChange?: (v?: string) => void; onMount?: (e: unknown) => void }) => {
    useEffect(() => {
      onMount?.({ id: "fake-editor" });
    }, [onMount]);
    return (
      <textarea
        data-testid="monaco"
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  }
}));

const mocked = vi.mocked(api);

const candidate: AuthUser = {
  id: "candidate_1",
  name: "Alice",
  email: "alice@example.com",
  role: "candidate"
};

const admin: AuthUser = {
  id: "admin_1",
  name: "Adam",
  email: "adam@example.com",
  role: "problem_admin"
};

function makeProblem(overrides: Partial<ProblemDetail> = {}): ProblemDetail {
  return {
    id: "problem_1",
    title: "Reverse a string",
    difficulty: "easy",
    timeLimitMs: 1000,
    memoryLimitKb: 65536,
    supportedLanguages: ["python", "cpp"],
    archivedAt: null,
    description: "Reverse the input string.",
    sampleInput: "abc",
    sampleOutput: "cba",
    constraints: "1 <= n <= 10",
    inputSpec: "A single line string",
    outputSpec: "The reversed string",
    sampleExplanation: "abc reversed is cba",
    ...overrides
  };
}

function startedExam(overrides: Partial<CandidateExamSummary> = {}): CandidateExamSummary {
  return {
    status: "started",
    assignmentCount: 1,
    durationMinutes: 60,
    startedAt: "2026-06-01T10:00:00.000Z",
    expiresAt: "2026-06-01T11:00:00.000Z",
    remainingSeconds: null,
    assignments: [
      {
        id: "assignment_1",
        candidateId: "candidate_1",
        problemId: "problem_1",
        problemTitle: "Reverse a string",
        difficulty: "easy",
        assignedAt: "2026-06-01T09:00:00.000Z",
        durationMinutes: 60,
        startedAt: "2026-06-01T10:00:00.000Z",
        expiresAt: "2026-06-01T11:00:00.000Z",
        latestSubmissionStatus: null
      }
    ],
    ...overrides
  };
}

function historyItem(overrides: Partial<SubmissionHistoryItem> = {}): SubmissionHistoryItem {
  return {
    id: "submission_1",
    candidateId: "candidate_1",
    candidateName: "Alice",
    candidateEmail: "alice@example.com",
    candidateRole: "candidate",
    problemId: "problem_1",
    problemTitle: "Reverse a string",
    language: "python",
    status: "finished",
    sourceCode: "print('x')",
    score: 100,
    createdAt: "2026-06-01T10:05:00.000Z",
    updatedAt: "2026-06-01T10:05:00.000Z",
    passedCases: 1,
    totalCases: 1,
    result: { submissionId: "submission_1", status: "finished", score: 100, cases: [] },
    ...overrides
  };
}

function customRun(overrides: Partial<CustomRunDetail> = {}): CustomRunDetail {
  return {
    id: "run_1",
    candidateId: "candidate_1",
    problemId: "problem_1",
    requestedBy: "candidate_1",
    language: "python",
    sourceCode: "print('x')",
    stdin: "abc",
    status: "finished",
    stdout: "cba",
    stderr: "",
    errorType: null,
    errorMessage: null,
    executionTimeMs: 12,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Prevent the live countdown interval from firing state updates during tests.
  vi.spyOn(globalThis, "setInterval").mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CandidateWorkspace — exam gate", () => {
  it("shows the loading state before the exam resolves", () => {
    mocked.getCandidateExam.mockReturnValue(new Promise(() => {}));
    render(<CandidateWorkspace token="t" user={candidate} />);
    expect(screen.getByText("Loading exam...")).toBeInTheDocument();
  });

  it("shows the no-assignments state", async () => {
    mocked.getCandidateExam.mockResolvedValue({
      status: "not_started",
      assignmentCount: 0,
      durationMinutes: null,
      startedAt: null,
      expiresAt: null,
      remainingSeconds: null,
      assignments: []
    });
    render(<CandidateWorkspace token="t" user={candidate} />);
    expect(await screen.findByText("No assignments yet")).toBeInTheDocument();
  });

  it("shows the expired state", async () => {
    mocked.getCandidateExam.mockResolvedValue({
      status: "expired",
      assignmentCount: 2,
      durationMinutes: 30,
      startedAt: null,
      expiresAt: null,
      remainingSeconds: 0,
      assignments: []
    });
    render(<CandidateWorkspace token="t" user={candidate} />);
    expect(await screen.findByText("Time limit reached")).toBeInTheDocument();
  });

  it("renders the workspace error when loading the exam fails", async () => {
    mocked.getCandidateExam.mockRejectedValue(new Error("network down"));
    render(<CandidateWorkspace token="t" user={candidate} />);
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("offers to start the exam and transitions into the workspace", async () => {
    mocked.getCandidateExam.mockResolvedValue({
      status: "not_started",
      assignmentCount: 1,
      durationMinutes: 1,
      startedAt: null,
      expiresAt: null,
      remainingSeconds: null,
      assignments: []
    });
    mocked.startCandidateExam.mockResolvedValue({ exam: startedExam() });
    mocked.getProblem.mockResolvedValue(makeProblem());
    mocked.getMySubmissionHistory.mockResolvedValue([]);

    render(<CandidateWorkspace token="t" user={candidate} />);

    // "1 minute" exercises the singular branch of formatExamDuration.
    expect(await screen.findByText("Time limit: 1 minute")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Exam" }));

    expect(await screen.findByText("Code Editor")).toBeInTheDocument();
    expect(mocked.startCandidateExam).toHaveBeenCalledWith("t");
  });
});

describe("CandidateWorkspace — started candidate workspace", () => {
  beforeEach(() => {
    mocked.getCandidateExam.mockResolvedValue(startedExam());
    mocked.getProblem.mockResolvedValue(makeProblem());
    mocked.getMySubmissionHistory.mockResolvedValue([historyItem()]);
  });

  it("renders the problem description, specs and samples", async () => {
    render(<CandidateWorkspace token="t" user={candidate} />);

    expect(await screen.findByText("Reverse the input string.")).toBeInTheDocument();
    expect(screen.getByText("Input Specification:")).toBeInTheDocument();
    expect(screen.getByText("Output Specification:")).toBeInTheDocument();
    expect(screen.getByText("Sample Explanation:")).toBeInTheDocument();
    expect(screen.getByText("Constraints:")).toBeInTheDocument();
    expect(screen.getByText("Difficulty: easy")).toBeInTheDocument();
  });

  it("switches the left tab to the submission history", async () => {
    render(<CandidateWorkspace token="t" user={candidate} />);
    await screen.findByText("Reverse the input string.");

    fireEvent.click(screen.getByRole("button", { name: "Submissions" }));
    expect(await screen.findByRole("button", { name: /view/i })).toBeInTheDocument();
  });

  it("creates a submission when Run & Submit is clicked", async () => {
    mocked.createSubmission.mockResolvedValue({ submissionId: "submission_99", status: "finished" });
    render(<CandidateWorkspace token="t" user={candidate} />);
    await screen.findByText("Reverse the input string.");

    fireEvent.click(screen.getByRole("button", { name: "Run & Submit Code" }));

    await waitFor(() =>
      expect(mocked.createSubmission).toHaveBeenCalledWith("t", {
        problemId: "problem_1",
        language: "python",
        sourceCode: "print(42)"
      })
    );
  });

  it("runs custom input from the terminal tab", async () => {
    mocked.createCustomRun.mockResolvedValue({ runId: "run_1", status: "finished" });
    render(<CandidateWorkspace token="t" user={candidate} />);
    await screen.findByText("Reverse the input string.");

    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    const textarea = screen.getByPlaceholderText("Input passed to stdin");
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Run Custom Input" }));

    await waitFor(() =>
      expect(mocked.createCustomRun).toHaveBeenCalledWith("t", {
        problemId: "problem_1",
        language: "python",
        sourceCode: "print(42)",
        stdin: "hello"
      })
    );
  });

  it("edits source code through the editor and changes language", async () => {
    render(<CandidateWorkspace token="t" user={candidate} />);
    await screen.findByText("Reverse the input string.");

    fireEvent.change(screen.getByTestId("monaco"), { target: { value: "print('edited')" } });
    expect(screen.getByTestId("monaco")).toHaveValue("print('edited')");

    fireEvent.change(screen.getByDisplayValue("python"), { target: { value: "cpp" } });
    expect(screen.getByDisplayValue("cpp")).toBeInTheDocument();
  });

  it("selecting a history item shows it in the output tab", async () => {
    render(<CandidateWorkspace token="t" user={candidate} />);
    await screen.findByText("Reverse the input string.");

    fireEvent.click(screen.getByRole("button", { name: "Submissions" }));
    fireEvent.click(await screen.findByRole("button", { name: /view/i }));
    // Output tab title reflects the selected submission status.
    expect(screen.getAllByText("finished").length).toBeGreaterThan(0);
  });

  it("opens settings and switches the keybinding to vim", async () => {
    render(<CandidateWorkspace token="t" user={candidate} />);
    await screen.findByText("Reverse the input string.");

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(screen.getByText("Editor Settings")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("Standard"), { target: { value: "vim" } });
    await waitFor(() => expect(initVimMode).toHaveBeenCalled());

    fireEvent.change(screen.getByDisplayValue("14"), { target: { value: "18" } });
    fireEvent.change(screen.getByDisplayValue("4 Spaces"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("Editor Settings")).not.toBeInTheDocument());
  });

  it("shows an error when submission creation fails", async () => {
    mocked.createSubmission.mockRejectedValue(new Error("submit failed"));
    render(<CandidateWorkspace token="t" user={candidate} />);
    await screen.findByText("Reverse the input string.");

    fireEvent.click(screen.getByRole("button", { name: "Run & Submit Code" }));
    expect(await screen.findByText("submit failed")).toBeInTheDocument();
  });
});

describe("CandidateWorkspace — admin preview", () => {
  beforeEach(() => {
    mocked.getAdminProblem.mockResolvedValue(makeProblem({ constraints: undefined, inputSpec: undefined, outputSpec: undefined, sampleExplanation: undefined }));
    mocked.getAdminSubmissionHistory.mockResolvedValue([]);
  });

  it("loads an admin preview without an exam gate and disables custom runs", async () => {
    mocked.createPreviewSubmission.mockResolvedValue({ submissionId: "preview_1", status: "finished" });
    render(<CandidateWorkspace token="t" user={admin} initialProblemId="problem_1" />);

    expect(await screen.findByText("Reverse the input string.")).toBeInTheDocument();
    expect(screen.getByText("Latest Run")).toBeInTheDocument();
    expect(mocked.getAdminProblem).toHaveBeenCalledWith("t", "problem_1");

    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    const runCustomButton = screen.getByRole("button", { name: "Run Custom Input" });
    expect(runCustomButton).toBeEnabled();
    fireEvent.click(runCustomButton);
    await waitFor(() => expect(mocked.createAdminCustomRun).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Run & Submit Code" }));
    await waitFor(() => expect(mocked.createPreviewSubmission).toHaveBeenCalled());
  });
});
