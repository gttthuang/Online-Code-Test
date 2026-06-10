import type { SubmissionHistoryItem, JudgeFailureType, SubmissionStatus } from "@oct/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SubmissionHistoryPanel } from "./SubmissionHistoryPanel";

function makeSubmission(overrides: Partial<SubmissionHistoryItem> = {}): SubmissionHistoryItem {
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
    sourceCode: "print('hi')",
    score: 100,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    passedCases: 2,
    totalCases: 2,
    result: {
      submissionId: "submission_1",
      status: "finished",
      score: 100,
      cases: [
        { testCaseId: "case-1", passed: true, executionTimeMs: 12, memoryKb: 2048 },
        { testCaseId: "case-2", passed: false, executionTimeMs: 30, memoryKb: 4096 }
      ]
    },
    ...overrides
  };
}

describe("SubmissionHistoryPanel", () => {
  it("renders a skeleton while loading", () => {
    const { container } = render(
      <SubmissionHistoryPanel emptyMessage="none" loading onSelect={vi.fn()} submissions={[]} />
    );
    expect(container.querySelector(".skeleton-list")).toBeInTheDocument();
  });

  it("renders the empty message when there are no submissions", () => {
    render(<SubmissionHistoryPanel emptyMessage="No submissions yet" onSelect={vi.fn()} submissions={[]} />);
    expect(screen.getByText("No submissions yet")).toBeInTheDocument();
  });

  it("lists submissions with verdict, language and case counts", () => {
    render(
      <SubmissionHistoryPanel
        emptyMessage="none"
        onSelect={vi.fn()}
        submissions={[makeSubmission()]}
      />
    );
    expect(screen.getByText("Reverse a string")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 cases")).toBeInTheDocument();
  });

  it("marks the row matching selectedId as active", () => {
    const { container } = render(
      <SubmissionHistoryPanel
        emptyMessage="none"
        onSelect={vi.fn()}
        selectedId="submission_1"
        submissions={[makeSubmission()]}
      />
    );
    expect(container.querySelector(".submission-history-row-active")).toBeInTheDocument();
  });

  it("opens a modal and fires onSelect when View is clicked, then closes it", () => {
    const onSelect = vi.fn();
    render(
      <SubmissionHistoryPanel
        emptyMessage="none"
        onSelect={onSelect}
        submissions={[makeSubmission({ status: "finished", passedCases: 2, totalCases: 2 })]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /view/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    const dialog = screen.getByText("Submission Detail");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("100 / 100")).toBeInTheDocument();
    expect(screen.getByText("case-1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Submission Detail")).not.toBeInTheDocument();
  });

  it("expands a row inline and collapses it again when inlineExpand is set", () => {
    const onSelect = vi.fn();
    render(
      <SubmissionHistoryPanel
        emptyMessage="none"
        inlineExpand
        onSelect={onSelect}
        submissions={[makeSubmission()]}
      />
    );

    // Collapsed: summary is visible, but the detail (code + cases) is not.
    expect(screen.getByText("Reverse a string")).toBeInTheDocument();
    expect(screen.queryByText("case-1")).not.toBeInTheDocument();
    expect(screen.queryByText("Submission Detail")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("print('hi')")).toBeInTheDocument();
    expect(screen.getByText("case-1")).toBeInTheDocument();
    // No modal in inline mode.
    expect(screen.queryByText("Submission Detail")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /hide/i }));
    expect(screen.queryByText("case-1")).not.toBeInTheDocument();
    // Collapsing does not re-fire selection.
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("closes the modal when clicking the backdrop but not the modal body", () => {
    const { container } = render(
      <SubmissionHistoryPanel emptyMessage="none" onSelect={vi.fn()} submissions={[makeSubmission()]} />
    );
    fireEvent.click(screen.getByRole("button", { name: /view/i }));

    const modal = container.querySelector(".submission-modal") as HTMLElement;
    fireEvent.click(modal); // clicking the modal body keeps it open
    expect(screen.getByText("Submission Detail")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close submission detail" }));
    expect(screen.queryByText("Submission Detail")).not.toBeInTheDocument();
  });

  it("shows an error message and the empty-cases fallback in the modal", () => {
    render(
      <SubmissionHistoryPanel
        emptyMessage="none"
        onSelect={vi.fn()}
        submissions={[
          makeSubmission({
            result: {
              submissionId: "submission_1",
              status: "failed",
              score: 0,
              cases: [],
              errorType: "runtime_error",
              errorMessage: "boom"
            }
          })
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /view/i }));
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("Judge result is not available yet.")).toBeInTheDocument();
  });

  it.each<[string, Partial<SubmissionHistoryItem>, string]>([
    ["pending when queued", { status: "queued" }, "Pending"],
    ["pending when running", { status: "running" }, "Pending"],
    [
      "accepted when finished and all cases pass",
      { status: "finished", passedCases: 2, totalCases: 2 },
      "Accepted"
    ],
    [
      "wrong answer when finished but not all pass",
      { status: "finished", passedCases: 1, totalCases: 2 },
      "Wrong Answer"
    ]
  ])("renders %s", (_label, overrides, expected) => {
    render(
      <SubmissionHistoryPanel emptyMessage="none" onSelect={vi.fn()} submissions={[makeSubmission(overrides)]} />
    );
    expect(within(screen.getByText("Reverse a string").closest(".submission-history-row") as HTMLElement)
      .getByText(expected)).toBeInTheDocument();
  });

  it.each<[JudgeFailureType | undefined, string]>([
    ["time_limit_exceeded", "Time Limit Exceeded"],
    ["runtime_error", "Runtime Error"],
    ["compile_error", "Compile Error"],
    ["sandbox_error", "System Error"],
    ["system_error", "System Error"],
    [undefined, "Failed"]
  ])("maps failure type %s to verdict %s", (errorType, expected) => {
    const status: SubmissionStatus = "failed";
    render(
      <SubmissionHistoryPanel
        emptyMessage="none"
        onSelect={vi.fn()}
        submissions={[
          makeSubmission({
            status,
            passedCases: 0,
            totalCases: 2,
            result: {
              submissionId: "submission_1",
              status: "failed",
              score: 0,
              cases: [],
              ...(errorType ? { errorType } : {})
            }
          })
        ]}
      />
    );
    expect(within(screen.getByText("Reverse a string").closest(".submission-history-row") as HTMLElement)
      .getByText(expected)).toBeInTheDocument();
  });
});
