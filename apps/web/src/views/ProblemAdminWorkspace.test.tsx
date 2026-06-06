import type { AuthUser, ProblemLifecycleImpact, ProblemSummary, SubmissionHistoryItem } from "@oct/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../lib/api";
import { ProblemAdminWorkspace } from "./ProblemAdminWorkspace";

vi.mock("../lib/api");

vi.mock("monaco-vim", () => ({ initVimMode: vi.fn(() => ({ dispose: vi.fn() })) }));
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange, onMount }: { value?: string; onChange?: (v?: string) => void; onMount?: (e: unknown) => void }) => {
    useEffect(() => {
      onMount?.({ id: "fake-editor" });
    }, [onMount]);
    return <textarea data-testid="monaco" value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} />;
  }
}));

const mocked = vi.mocked(api);

function makeProblem(overrides: Partial<ProblemSummary> = {}): ProblemSummary {
  return {
    id: "problem_1",
    title: "FizzBuzz",
    difficulty: "easy",
    timeLimitMs: 1000,
    memoryLimitKb: 65536,
    supportedLanguages: ["python", "cpp"],
    archivedAt: null,
    ...overrides
  };
}

const impact: ProblemLifecycleImpact = {
  problemId: "problem_1",
  assignments: 2,
  candidateSubmissions: 5,
  previewSubmissions: 1,
  reviews: 3,
  canDeleteWithoutForce: false
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProblemAdminWorkspace currentUserId="admin_1" token="t" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, "setInterval").mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);
  mocked.getAdminProblems.mockResolvedValue([]);
  mocked.getUsers.mockResolvedValue([]);
  mocked.getAdminSubmissionHistory.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProblemAdminWorkspace — dashboard & inventory", () => {
  it("renders metrics and problem rows", async () => {
    mocked.getAdminProblems.mockResolvedValue([
      makeProblem(),
      makeProblem({ id: "problem_2", title: "Hard one", difficulty: "hard", archivedAt: "2026-06-01T00:00:00.000Z" })
    ]);
    renderAt("/problem-admin");

    expect(await screen.findByText("FizzBuzz")).toBeInTheDocument();
    expect(screen.getByText("Hard one")).toBeInTheDocument();
    expect(screen.getByText("archived")).toBeInTheDocument();
    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
  });

  it("shows an inventory error when problems fail to load", async () => {
    mocked.getAdminProblems.mockRejectedValue(new Error("inventory boom"));
    renderAt("/problem-admin/problems");
    expect(await screen.findByText("inventory boom")).toBeInTheDocument();
  });
});

describe("ProblemAdminWorkspace — problem builder", () => {
  it("walks the builder tabs and edits fields", async () => {
    renderAt("/problem-admin/new");
    await screen.findByText("Create a new problem");

    fireEvent.change(screen.getByDisplayValue("FizzBuzz"), { target: { value: "New Title" } });
    expect(screen.getByDisplayValue("New Title")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "description" }));
    expect(screen.getByText("Constraints")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sample IO" }));
    expect(screen.getByText("Input Specification")).toBeInTheDocument();
    expect(screen.getByText("Sample Explanation")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "testcase" }));
    expect(screen.getByText("Batch import paired files")).toBeInTheDocument();
  });

  it("rejects creating a problem with no complete testcases", async () => {
    renderAt("/problem-admin/new");
    await screen.findByText("Create a new problem");

    fireEvent.click(screen.getByRole("button", { name: "Create Problem" }));
    expect((await screen.findAllByText("At least one hidden testcase is required.")).length).toBeGreaterThan(0);
  });

  it("creates a problem when a complete testcase is provided", async () => {
    mocked.createProblem.mockResolvedValue({ problem: makeProblem({ id: "problem_new", title: "Created" }) });
    const user = userEvent.setup();
    const { container } = renderAt("/problem-admin/new");
    await screen.findByText("Create a new problem");

    fireEvent.click(screen.getByRole("button", { name: "testcase" }));
    const fileInputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    // [0] is the batch importer; [1]=.in, [2]=.out for the first testcase row.
    await user.upload(fileInputs[1], new File(["1"], "case.in", { type: "text/plain" }));
    await user.upload(fileInputs[2], new File(["1"], "case.out", { type: "text/plain" }));

    fireEvent.click(screen.getByRole("button", { name: "Create Problem" }));
    await waitFor(() => expect(mocked.createProblem).toHaveBeenCalled());
    expect(await screen.findByText("Problem created")).toBeInTheDocument();
  });

  it("flags a testcase that is missing one of its files", async () => {
    const user = userEvent.setup();
    const { container } = renderAt("/problem-admin/new");
    await screen.findByText("Create a new problem");

    fireEvent.click(screen.getByRole("button", { name: "testcase" }));
    const fileInputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    await user.upload(fileInputs[1], new File(["1"], "case.in", { type: "text/plain" }));

    fireEvent.click(screen.getByRole("button", { name: "Create Problem" }));
    expect((await screen.findAllByText(/must include both input and output files/)).length).toBeGreaterThan(0);
  });

  it("batch imports paired .in/.out files", async () => {
    const user = userEvent.setup();
    const { container } = renderAt("/problem-admin/new");
    await screen.findByText("Create a new problem");

    fireEvent.click(screen.getByRole("button", { name: "testcase" }));
    const batchInput = container.querySelector<HTMLInputElement>('input[accept=".in,.out"]')!;
    await user.upload(batchInput, [
      new File(["1"], "01.in", { type: "text/plain" }),
      new File(["1"], "01.out", { type: "text/plain" })
    ]);

    expect(await screen.findByText("Testcases imported")).toBeInTheDocument();
  });

  it("reports an error for an unpaired batch file", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderAt("/problem-admin/new");
    await screen.findByText("Create a new problem");

    fireEvent.click(screen.getByRole("button", { name: "testcase" }));
    const batchInput = container.querySelector<HTMLInputElement>('input[accept=".in,.out"]')!;
    await user.upload(batchInput, [new File(["1"], "notes.txt", { type: "text/plain" })]);

    expect(await screen.findByText("Batch import failed")).toBeInTheDocument();
  });

  it("adds and clears testcase rows", async () => {
    const user = userEvent.setup();
    const { container } = renderAt("/problem-admin/new");
    await screen.findByText("Create a new problem");
    fireEvent.click(screen.getByRole("button", { name: "testcase" }));

    // Add is disabled until the current row has both files.
    expect(screen.getByRole("button", { name: "Add Testcase" })).toBeDisabled();
    const fileInputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    await user.upload(fileInputs[1], new File(["1"], "case.in", { type: "text/plain" }));
    await user.upload(fileInputs[2], new File(["1"], "case.out", { type: "text/plain" }));
    expect(screen.getByRole("button", { name: "Add Testcase" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Add Testcase" }));
    expect(screen.getByText("Testcase 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Remove testcase 2/ }));
    expect(screen.queryByText("Testcase 2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Clear testcase 1/ }));
    expect(screen.getByText("Testcase 1")).toBeInTheDocument();
  });
});

describe("ProblemAdminWorkspace — delete & archive", () => {
  it("loads impact then force-deletes a problem", async () => {
    mocked.getProblemImpact.mockResolvedValue(impact);
    mocked.deleteProblem.mockResolvedValue(undefined);
    mocked.getAdminProblems.mockResolvedValue([makeProblem()]);
    renderAt("/problem-admin/problems");
    await screen.findByText("FizzBuzz");

    fireEvent.click(screen.getByRole("button", { name: "x" }));
    expect(await screen.findByText("Delete problem")).toBeInTheDocument();
    // Force checkbox appears because canDeleteWithoutForce is false.
    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Force Delete" }));

    await waitFor(() => expect(mocked.deleteProblem).toHaveBeenCalledWith("t", "problem_1", true));
    expect(await screen.findByText("Problem deleted")).toBeInTheDocument();
  });

  it("cancels a delete", async () => {
    mocked.getProblemImpact.mockResolvedValue(impact);
    mocked.getAdminProblems.mockResolvedValue([makeProblem()]);
    renderAt("/problem-admin/problems");
    await screen.findByText("FizzBuzz");

    fireEvent.click(screen.getByRole("button", { name: "x" }));
    await screen.findByText("Delete problem");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // expect(screen.queryByText("Delete problem")).not.toBeInTheDocument();
    // 使用 waitFor 等待 DOM 更新
    await waitFor(() => {
      expect(screen.queryByText("Delete problem")).not.toBeInTheDocument();
    });
  });

  it("surfaces an error when impact fails to load", async () => {
    mocked.getProblemImpact.mockRejectedValue(new Error("impact boom"));
    mocked.getAdminProblems.mockResolvedValue([makeProblem()]);
    renderAt("/problem-admin/problems");
    await screen.findByText("FizzBuzz");

    fireEvent.click(screen.getByRole("button", { name: "x" }));
    expect((await screen.findAllByText("impact boom")).length).toBeGreaterThan(0);
  });

  it("archives a problem", async () => {
    mocked.getAdminProblems.mockResolvedValue([makeProblem()]);
    mocked.archiveProblem.mockResolvedValue({ problem: makeProblem({ archivedAt: "2026-06-02T00:00:00.000Z" }) });
    renderAt("/problem-admin/problems");
    await screen.findByText("FizzBuzz");

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(mocked.archiveProblem).toHaveBeenCalledWith("t", "problem_1", true));
    expect(await screen.findByText("Problem archived")).toBeInTheDocument();
  });

  it("navigates to the preview workspace", async () => {
    mocked.getAdminProblems.mockResolvedValue([makeProblem()]);
    mocked.getAdminProblem.mockResolvedValue({
      ...makeProblem(),
      description: "preview desc",
      sampleInput: "1",
      sampleOutput: "1"
    });
    renderAt("/problem-admin/problems");
    await screen.findByText("FizzBuzz");

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText(/Admin Preview Mode/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back to Inventory/ }));
    await screen.findByText("FizzBuzz");
  });
});

describe("ProblemAdminWorkspace — user management", () => {
  function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return { id: "user_1", name: "Bob", email: "bob@example.com", role: "candidate", ...overrides };
  }

  it("lists users and creates a new one", async () => {
    mocked.getUsers.mockResolvedValue([makeUser({ id: "admin_1", name: "Self", role: "problem_admin" })]);
    mocked.createUser.mockResolvedValue({ user: makeUser({ id: "user_9", name: "Carol", email: "carol@example.com" }) });
    renderAt("/problem-admin/users");

    expect(await screen.findByText("Self")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("New teammate"), { target: { value: "Carol" } });
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "carol@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => expect(mocked.createUser).toHaveBeenCalled());
    expect(await screen.findByText("User created")).toBeInTheDocument();
  });

  it("disables deleting the current user and deletes others", async () => {
    mocked.getUsers.mockResolvedValue([
      makeUser({ id: "admin_1", name: "Self", role: "problem_admin" }),
      makeUser({ id: "user_2", name: "Other" })
    ]);
    mocked.deleteUser.mockResolvedValue(undefined);
    renderAt("/problem-admin/users");
    await screen.findByText("Other");

    const selfRow = screen.getByText("Self").closest(".user-table-row") as HTMLElement;
    expect(within(selfRow).getByRole("button")).toBeDisabled();

    const otherRow = screen.getByText("Other").closest(".user-table-row") as HTMLElement;
    fireEvent.click(within(otherRow).getByRole("button"));
    await waitFor(() => expect(mocked.deleteUser).toHaveBeenCalledWith("t", "user_2"));
    expect(await screen.findByText("User deleted")).toBeInTheDocument();
  });

  it("shows an error when users fail to load", async () => {
    mocked.getUsers.mockRejectedValue(new Error("users boom"));
    renderAt("/problem-admin/users");
    expect((await screen.findAllByText("users boom")).length).toBeGreaterThan(0);
  });
});

describe("ProblemAdminWorkspace — submission history", () => {
  function makeSubmission(overrides: Partial<SubmissionHistoryItem> = {}): SubmissionHistoryItem {
    return {
      id: "submission_1",
      candidateId: "candidate_1",
      candidateName: "Alice",
      candidateEmail: "alice@example.com",
      candidateRole: "candidate",
      problemId: "problem_1",
      problemTitle: "FizzBuzz",
      language: "python",
      status: "finished",
      sourceCode: "print(1)",
      score: 100,
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-01T10:00:00.000Z",
      passedCases: 1,
      totalCases: 1,
      result: { submissionId: "submission_1", status: "finished", score: 100, cases: [] },
      ...overrides
    };
  }

  it("filters submissions by search query and status", async () => {
    mocked.getAdminSubmissionHistory.mockResolvedValue([
      makeSubmission(),
      makeSubmission({ id: "submission_2", candidateName: "Zed", status: "failed", problemTitle: "Other" })
    ]);
    renderAt("/problem-admin/submissions");

    expect(await screen.findByText("FizzBuzz")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Candidate, problem/), { target: { value: "Zed" } });
    await waitFor(() => expect(screen.queryByText("FizzBuzz")).not.toBeInTheDocument());
    expect(screen.getByText("Other")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("All"), { target: { value: "finished" } });
    await waitFor(() => expect(screen.queryByText("Other")).not.toBeInTheDocument());
  });

  it("shows an error when submissions fail to load", async () => {
    mocked.getAdminSubmissionHistory.mockRejectedValue(new Error("subs boom"));
    renderAt("/problem-admin/submissions");
    expect(await screen.findByText("subs boom")).toBeInTheDocument();
  });
});
