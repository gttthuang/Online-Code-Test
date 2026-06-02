import type { ProblemSummary } from "@oct/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../lib/api";
import { InterviewerWorkspace } from "./InterviewerWorkspace";

vi.mock("../lib/api");

vi.mock("./interviewer/CandidateManager", () => ({
  CandidateManager: () => <div data-testid="candidate-manager">manager</div>
}));
vi.mock("./interviewer/AssignmentForm", () => ({
  AssignmentForm: ({ problems }: { problems: ProblemSummary[] }) => (
    <div data-testid="assignment-form">problems:{problems.length}</div>
  )
}));
vi.mock("./interviewer/CandidateResults", () => ({
  CandidateResults: () => <div data-testid="candidate-results">results</div>
}));

const mocked = vi.mocked(api);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InterviewerWorkspace token="t" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getAdminProblems.mockResolvedValue([
    { id: "p1", title: "P1", difficulty: "easy", timeLimitMs: 1, memoryLimitKb: 1, supportedLanguages: ["python"], archivedAt: null }
  ]);
  mocked.getCandidates.mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

describe("InterviewerWorkspace", () => {
  it("renders the full dashboard and threads loaded problems to children", async () => {
    renderAt("/interviewer");
    expect(screen.getByText("Interviewer Dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-manager")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-results")).toBeInTheDocument();
    expect(await screen.findByText("problems:1")).toBeInTheDocument();
  });

  it("shows only the candidate manager on the candidates section", () => {
    renderAt("/interviewer/candidates");
    expect(screen.getByTestId("candidate-manager")).toBeInTheDocument();
    expect(screen.queryByTestId("assignment-form")).not.toBeInTheDocument();
  });

  it("shows only the results panel on the results section", () => {
    renderAt("/interviewer/results");
    expect(screen.getByTestId("candidate-results")).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-manager")).not.toBeInTheDocument();
  });

  it("renders a workspace error when the initial load fails", async () => {
    mocked.getAdminProblems.mockRejectedValue(new Error("ws boom"));
    renderAt("/interviewer");
    await waitFor(() => expect(screen.getByText(/ws boom/)).toBeInTheDocument());
  });
});
