import type {
  AuthUser,
  CandidateReviewContextResponse,
  InterviewReview,
  SubmissionHistoryItem
} from "@oct/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { CandidateResults } from "./CandidateResults";

vi.mock("../../lib/api");
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value?: string; onChange?: (v?: string) => void }) => (
    <textarea data-testid="monaco" value={value ?? ""} onChange={(event) => onChange?.(event.target.value)} />
  )
}));

const mocked = vi.mocked(api);

const candidate: AuthUser = { id: "cand_1", name: "Dave", email: "dave@example.com", role: "candidate" };
const candidateLabel = "Dave (dave@example.com)";

function submission(overrides: Partial<SubmissionHistoryItem> = {}): SubmissionHistoryItem {
  return {
    id: "submission_1",
    candidateId: "cand_1",
    candidateName: "Dave",
    candidateEmail: "dave@example.com",
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

function review(overrides: Partial<InterviewReview> = {}): InterviewReview {
  return {
    id: "review_1",
    candidateId: "cand_1",
    problemId: "problem_1",
    problemTitle: "FizzBuzz",
    interviewerId: "int_1",
    interviewerName: "Ivy",
    notes: "solid",
    rubric: { problemSolving: 4, codeQuality: 4, communication: 4, testingDebugging: 4 },
    recommendation: "hire",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides
  };
}

function reviewContext(overrides: Partial<CandidateReviewContextResponse> = {}): CandidateReviewContextResponse {
  return {
    candidate,
    assignments: [
      {
        id: "assignment_1",
        candidateId: "cand_1",
        problemId: "problem_1",
        problemTitle: "FizzBuzz",
        difficulty: "easy",
        assignedAt: "2026-06-01T09:00:00.000Z",
        durationMinutes: 60,
        startedAt: null,
        expiresAt: null,
        latestSubmissionStatus: null
      }
    ],
    reviews: [],
    ...overrides
  };
}

async function loadResults(reviews: InterviewReview[] = []) {
  mocked.getCandidateSubmissionHistory.mockResolvedValue({ candidate, submissions: [submission()] });
  mocked.getCandidateReviewContext.mockResolvedValue(reviewContext({ reviews }));

  render(<CandidateResults token="t" candidates={[candidate]} />);
  fireEvent.change(screen.getByPlaceholderText(/Type to search/), { target: { value: candidateLabel } });
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  await screen.findByText("Notes and rubric");
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("CandidateResults", () => {
  it("shows the empty prompt before a candidate is chosen", () => {
    render(<CandidateResults token="t" candidates={[candidate]} />);
    expect(screen.getByText("Select a candidate to view their submission history.")).toBeInTheDocument();
  });

  it("rejects loading for an unknown candidate", () => {
    render(<CandidateResults token="t" candidates={[candidate]} />);
    fireEvent.change(screen.getByPlaceholderText(/Type to search/), { target: { value: "Nobody" } });
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.getByText(/select a valid candidate from the dropdown/)).toBeInTheDocument();
  });

  it("loads results and renders the review/scratch/history panels", async () => {
    await loadResults();
    expect(screen.getByText("Run code for Dave")).toBeInTheDocument();
    expect(screen.getAllByText("FizzBuzz").length).toBeGreaterThan(0);
    expect(screen.getByText("Run current code")).toBeInTheDocument();
  });

  it("surfaces a load error", async () => {
    mocked.getCandidateSubmissionHistory.mockRejectedValue(new Error("load boom"));
    mocked.getCandidateReviewContext.mockRejectedValue(new Error("load boom"));
    render(<CandidateResults token="t" candidates={[candidate]} />);
    fireEvent.change(screen.getByPlaceholderText(/Type to search/), { target: { value: candidateLabel } });
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(await screen.findByText("load boom")).toBeInTheDocument();
  });

  it("saves a review with edited rubric, recommendation and notes", async () => {
    mocked.saveCandidateReview.mockResolvedValue({ review: review() });
    await loadResults();

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "5" } });
    fireEvent.change(screen.getByDisplayValue("Lean hire"), { target: { value: "strong_hire" } });
    fireEvent.change(screen.getByRole("textbox", { name: "" }) ?? screen.getAllByRole("textbox")[0], {
      target: { value: "great" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Review" }));
    await waitFor(() => expect(mocked.saveCandidateReview).toHaveBeenCalled());
    expect(await screen.findByText("Review saved.")).toBeInTheDocument();
  });

  it("pre-fills and deletes an existing review", async () => {
    mocked.deleteCandidateReview.mockResolvedValue(undefined);
    await loadResults([review({ notes: "previously noted" })]);

    // The effect loads the saved review into the form.
    expect(await screen.findByDisplayValue("previously noted")).toBeInTheDocument();

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);
    await waitFor(() => expect(mocked.deleteCandidateReview).toHaveBeenCalledWith("t", "cand_1", "problem_1"));
    expect(await screen.findByText("Review deleted.")).toBeInTheDocument();
  });

  it("starts a scratch custom run", async () => {
    mocked.createAdminCustomRun.mockResolvedValue({ runId: "run_1", status: "finished" });
    await loadResults();

    fireEvent.change(screen.getByTestId("monaco"), { target: { value: "print('hi')" } });
    fireEvent.change(screen.getByPlaceholderText("Input passed to stdin"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(mocked.createAdminCustomRun).toHaveBeenCalledWith("t", {
        candidateId: "cand_1",
        problemId: "problem_1",
        language: "python",
        sourceCode: "print('hi')",
        stdin: "5"
      })
    );
    expect(await screen.findByText("finished")).toBeInTheDocument();
  });

  it("reports a scratch run error", async () => {
    mocked.createAdminCustomRun.mockRejectedValue(new Error("run boom"));
    await loadResults();

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("run boom")).toBeInTheDocument();
  });
});
