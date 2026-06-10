import type { AuthUser, ProblemSummary } from "@oct/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../lib/api";
import { InterviewerWorkspace } from "./InterviewerWorkspace";

vi.mock("../lib/api");

vi.mock("./interviewer/AssignmentForm", () => ({
  AssignmentForm: ({ problems }: { problems: ProblemSummary[] }) => (
    <div data-testid="assignment-form">problems:{problems.length}</div>
  )
}));
vi.mock("./interviewer/CandidateResults", () => ({
  CandidateResults: () => <div data-testid="candidate-results">results</div>
}));

const mocked = vi.mocked(api);

function renderAt(path: string, currentUserId = "interviewer_self") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InterviewerWorkspace currentUserId={currentUserId} token="t" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getAdminProblems.mockResolvedValue([
    { id: "p1", title: "P1", difficulty: "easy", timeLimitMs: 1, memoryLimitKb: 1, supportedLanguages: ["python"], archivedAt: null, displayId: 101 }
  ]);
  mocked.getCandidates.mockResolvedValue([]);
  mocked.getUsers.mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

describe("InterviewerWorkspace", () => {
  it("defaults to the assign section and threads loaded problems to it", async () => {
    renderAt("/interviewer");
    expect(screen.getByRole("heading", { name: "Assign" })).toBeInTheDocument();
    expect(await screen.findByText("problems:1")).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-results")).not.toBeInTheDocument();
  });

  it("shows only the results panel on the results section", () => {
    renderAt("/interviewer/results");
    expect(screen.getByTestId("candidate-results")).toBeInTheDocument();
    expect(screen.queryByTestId("assignment-form")).not.toBeInTheDocument();
  });

  it("shows only the assign panel on the assign section", () => {
    renderAt("/interviewer/assign");
    expect(screen.getByTestId("assignment-form")).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-results")).not.toBeInTheDocument();
  });

  it("renders a workspace error when the initial load fails", async () => {
    mocked.getAdminProblems.mockRejectedValue(new Error("ws boom"));
    renderAt("/interviewer");
    await waitFor(() => expect(screen.getByText(/ws boom/)).toBeInTheDocument());
  });

  it("handles getCandidates failure gracefully", async () => {
    mocked.getCandidates.mockRejectedValue(new Error("c boom"));
    renderAt("/interviewer");
    // still renders the assign form even if candidates fail
    expect(await screen.findByText("problems:1")).toBeInTheDocument();
  });
});

describe("InterviewerWorkspace — user management", () => {
  function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return { id: "user_1", name: "Bob", email: "bob@example.com", role: "candidate", ...overrides };
  }

  it("lists users and creates a new one", async () => {
    mocked.getUsers.mockResolvedValue([makeUser({ id: "interviewer_self", name: "Self", role: "interviewer" })]);
    mocked.createUser.mockResolvedValue({
      user: makeUser({ id: "user_9", name: "Carol", email: "carol@example.com" }),
      password: "Gen3ratedPass"
    });
    renderAt("/interviewer/users");

    expect(await screen.findByText("Self")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("name"), { target: { value: "Carol" } });
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "carol@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => expect(mocked.createUser).toHaveBeenCalled());
    expect(await screen.findByText("User created")).toBeInTheDocument();
    // The one-time generated password is surfaced to the interviewer.
    expect(screen.getByText("Gen3ratedPass")).toBeInTheDocument();
  });

  it("disables deleting the current user and deletes others", async () => {
    mocked.getUsers.mockResolvedValue([
      makeUser({ id: "interviewer_self", name: "Self", role: "interviewer" }),
      makeUser({ id: "user_2", name: "Other" })
    ]);
    mocked.deleteUser.mockResolvedValue(undefined);
    renderAt("/interviewer/users");
    await screen.findByText("Other");

    const selfRow = screen.getByText("Self").closest(".user-table-row") as HTMLElement;
    expect(within(selfRow).getByRole("button", { name: "x" })).toBeDisabled();

    const otherRow = screen.getByText("Other").closest(".user-table-row") as HTMLElement;
    fireEvent.click(within(otherRow).getByRole("button", { name: "x" }));
    await waitFor(() => expect(mocked.deleteUser).toHaveBeenCalledWith("t", "user_2"));
    expect(await screen.findByText("User deleted")).toBeInTheDocument();
  });

  it("resets a user's password and surfaces the new credentials", async () => {
    mocked.getUsers.mockResolvedValue([
      makeUser({ id: "interviewer_self", name: "Self", role: "interviewer" }),
      makeUser({ id: "user_2", name: "Other", email: "other@example.com" })
    ]);
    mocked.resetUserPassword.mockResolvedValue({ password: "Fresh3rPass" });
    renderAt("/interviewer/users");
    await screen.findByText("Other");

    const otherRow = screen.getByText("Other").closest(".user-table-row") as HTMLElement;
    fireEvent.click(within(otherRow).getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(mocked.resetUserPassword).toHaveBeenCalledWith("t", "user_2"));
    expect(await screen.findByText("Password reset")).toBeInTheDocument();
    expect(screen.getByText("Fresh3rPass")).toBeInTheDocument();
  });

  it("shows an error when users fail to load", async () => {
    mocked.getUsers.mockRejectedValue(new Error("users boom"));
    renderAt("/interviewer/users");
    expect((await screen.findAllByText("users boom")).length).toBeGreaterThan(0);
  });
});
