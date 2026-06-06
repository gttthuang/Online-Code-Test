import type { AuthUser, ProblemSummary } from "@oct/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { AssignmentForm } from "./AssignmentForm";

vi.mock("../../lib/api");
const mocked = vi.mocked(api);

const candidate: AuthUser = { id: "cand_1", name: "Dave", email: "dave@example.com", role: "candidate" };

function makeProblem(overrides: Partial<ProblemSummary> = {}): ProblemSummary {
  return {
    id: "problem_1",
    title: "FizzBuzz",
    difficulty: "easy",
    timeLimitMs: 1000,
    memoryLimitKb: 65536,
    supportedLanguages: ["python"],
    archivedAt: null,
    displayId: 103,
    ...overrides
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("AssignmentForm", () => {
  it("shows the empty state when no active problems exist", () => {
    render(<AssignmentForm token="t" candidates={[candidate]} problems={[makeProblem({ archivedAt: "2026-06-01" })]} />);
    expect(screen.getByText("No active problems available.")).toBeInTheDocument();
  });

  it("validates candidate and problem selection before assigning", () => {
    render(<AssignmentForm token="t" candidates={[candidate]} problems={[makeProblem()]} />);

    // Type a candidate but select no problems -> button stays disabled, and a
    // manual submit reports the validation error.
    fireEvent.change(screen.getByPlaceholderText(/Type to search/), { target: { value: "Dave (dave@example.com)" } });
    fireEvent.submit(screen.getByPlaceholderText(/Type to search/).closest("form")!);
    expect(screen.getByText(/select a valid candidate and at least one problem/)).toBeInTheDocument();
  });

  it("assigns selected problems to a candidate", async () => {
    mocked.createAssignment.mockResolvedValue({ assignment: {}, assignments: [] } as never);
    render(<AssignmentForm token="t" candidates={[candidate]} problems={[makeProblem()]} />);

    fireEvent.change(screen.getByPlaceholderText(/Type to search/), { target: { value: "Dave (dave@example.com)" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create Assignment" }));

    await waitFor(() =>
      expect(mocked.createAssignment).toHaveBeenCalledWith("t", {
        candidateId: "cand_1",
        problemIds: ["problem_1"],
        durationMinutes: 60
      })
    );
    expect(await screen.findByText(/Assigned 1 problem to Dave for 60 minutes/)).toBeInTheDocument();
  });

  it("surfaces an assignment error", async () => {
    mocked.createAssignment.mockRejectedValue(new Error("assign boom"));
    render(<AssignmentForm token="t" candidates={[candidate]} problems={[makeProblem()]} />);

    fireEvent.change(screen.getByPlaceholderText(/Type to search/), { target: { value: "Dave (dave@example.com)" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create Assignment" }));

    expect(await screen.findByText("assign boom")).toBeInTheDocument();
  });

  it("toggles a problem off when clicked twice", () => {
    render(<AssignmentForm token="t" candidates={[candidate]} problems={[makeProblem()]} />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });
});
