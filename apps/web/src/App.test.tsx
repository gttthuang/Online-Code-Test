import type { AuthUser, CandidateExamSummary } from "@oct/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "./lib/api";
import * as session from "./lib/session";
import { App } from "./App";

vi.mock("./lib/api");
vi.mock("./lib/session");

vi.mock("./views/CandidateWorkspace", () => ({
  CandidateWorkspace: ({ initialProblemId }: { initialProblemId?: string | null }) => (
    <div data-testid="candidate-workspace">candidate {initialProblemId ?? "none"}</div>
  )
}));
vi.mock("./views/InterviewerWorkspace", () => ({
  InterviewerWorkspace: () => <div data-testid="interviewer-workspace">interviewer</div>
}));
vi.mock("./views/ProblemAdminWorkspace", () => ({
  ProblemAdminWorkspace: () => <div data-testid="admin-workspace">admin</div>
}));
vi.mock("./views/LoginPanel", () => ({
  LoginPanel: ({ error, onLogin }: { error: string | null; onLogin: (email: string) => void }) => (
    <div data-testid="login-panel">
      {error ? <p>{error}</p> : null}
      <button type="button" onClick={() => onLogin("user@example.com")}>
        do-login
      </button>
    </div>
  )
}));

const mockedApi = vi.mocked(api);
const mockedSession = vi.mocked(session);

const candidate: AuthUser = { id: "candidate_1", name: "Alice", email: "alice@example.com", role: "candidate" };

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.loadStoredSession.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App — authentication flow", () => {
  it("shows the login panel when there is no session", () => {
    renderApp("/login");
    expect(screen.getByTestId("login-panel")).toBeInTheDocument();
  });

  it("logs in and routes to the role home", async () => {
    mockedApi.loginWithEmail.mockResolvedValue({ token: "tok", user: candidate });
    mockedApi.getMe.mockResolvedValue(candidate);
    renderApp("/login");

    fireEvent.click(screen.getByRole("button", { name: "do-login" }));

    expect(await screen.findByTestId("candidate-workspace")).toBeInTheDocument();
    expect(mockedSession.saveStoredSession).toHaveBeenCalled();
  });

  it("renders a login error when login fails", async () => {
    mockedApi.loginWithEmail.mockRejectedValue(new Error("bad credentials"));
    renderApp("/login");

    fireEvent.click(screen.getByRole("button", { name: "do-login" }));
    expect(await screen.findByText("bad credentials")).toBeInTheDocument();
  });

  it("restores a stored session via getMe", async () => {
    mockedSession.loadStoredSession.mockReturnValue({ token: "tok", user: candidate });
    mockedApi.getMe.mockResolvedValue(candidate);
    renderApp("/candidate");

    expect(screen.getByText("Loading session...")).toBeInTheDocument();
    expect(await screen.findByTestId("candidate-workspace")).toBeInTheDocument();
    // WorkspaceFrame chrome
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Online Code Test")).toBeInTheDocument();
  });

  it("clears the session when getMe rejects", async () => {
    mockedSession.loadStoredSession.mockReturnValue({ token: "tok", user: candidate });
    mockedApi.getMe.mockRejectedValue(new Error("expired"));
    renderApp("/candidate");

    await waitFor(() => expect(mockedSession.clearStoredSession).toHaveBeenCalled());
    expect(await screen.findByTestId("login-panel")).toBeInTheDocument();
  });

  it("logs out from the workspace", async () => {
    mockedSession.loadStoredSession.mockReturnValue({ token: "tok", user: candidate });
    mockedApi.getMe.mockResolvedValue(candidate);
    renderApp("/candidate");
    await screen.findByTestId("candidate-workspace");

    fireEvent.click(screen.getByRole("button", { name: /Log Out/ }));
    await waitFor(() => expect(mockedSession.clearStoredSession).toHaveBeenCalled());
    expect(await screen.findByTestId("login-panel")).toBeInTheDocument();
  });
});

describe("App — routing guards & chrome", () => {
  it("redirects to the role home when the role does not match the route", async () => {
    mockedSession.loadStoredSession.mockReturnValue({ token: "tok", user: candidate });
    mockedApi.getMe.mockResolvedValue(candidate);
    renderApp("/problem-admin");

    // Candidate hitting the admin route is bounced to the candidate workspace.
    expect(await screen.findByTestId("candidate-workspace")).toBeInTheDocument();
  });

  it("passes the problemId param into the candidate workspace", async () => {
    mockedSession.loadStoredSession.mockReturnValue({ token: "tok", user: candidate });
    mockedApi.getMe.mockResolvedValue(candidate);
    renderApp("/candidate/problems/problem_42");

    expect(await screen.findByText("candidate problem_42")).toBeInTheDocument();
  });

  it("toggles the sidebar collapsed and expanded", async () => {
    mockedSession.loadStoredSession.mockReturnValue({ token: "tok", user: candidate });
    mockedApi.getMe.mockResolvedValue(candidate);
    renderApp("/candidate");
    await screen.findByTestId("candidate-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("redirects unknown routes to the login page when signed out", async () => {
    renderApp("/totally-unknown");
    expect(await screen.findByTestId("login-panel")).toBeInTheDocument();
  });
});

describe("App — candidate assignments page", () => {
  function exam(overrides: Partial<CandidateExamSummary> = {}): CandidateExamSummary {
    return {
      status: "started",
      assignmentCount: 1,
      durationMinutes: 60,
      startedAt: "2026-06-01T10:00:00.000Z",
      expiresAt: "2026-06-01T11:00:00.000Z",
      remainingSeconds: 125,
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

  beforeEach(() => {
    mockedSession.loadStoredSession.mockReturnValue({ token: "tok", user: candidate });
    mockedApi.getMe.mockResolvedValue(candidate);
  });

  it("lists in-progress assignments with remaining time", async () => {
    mockedApi.getCandidateExam.mockResolvedValue(exam());
    renderApp("/candidate/assignments");

    expect(await screen.findByText("Reverse a string")).toBeInTheDocument();
    expect(screen.getByText("2:05 remaining")).toBeInTheDocument();
  });

  it("shows the empty state when there are no assignments", async () => {
    mockedApi.getCandidateExam.mockResolvedValue(exam({ assignmentCount: 0, assignments: [] }));
    renderApp("/candidate/assignments");
    expect(await screen.findByText("No assignments yet.")).toBeInTheDocument();
  });

  it("shows the expired state", async () => {
    mockedApi.getCandidateExam.mockResolvedValue(exam({ status: "expired" }));
    renderApp("/candidate/assignments");
    expect(await screen.findByText("Time limit reached")).toBeInTheDocument();
  });

  it("starts the exam from the not-started state", async () => {
    mockedApi.getCandidateExam.mockResolvedValue(exam({ status: "not_started", remainingSeconds: null }));
    mockedApi.startCandidateExam.mockResolvedValue({ exam: exam({ status: "started" }) });
    renderApp("/candidate/assignments");

    fireEvent.click(await screen.findByRole("button", { name: "Start Exam" }));
    await waitFor(() => expect(mockedApi.startCandidateExam).toHaveBeenCalledWith("tok"));
    expect(await screen.findByText("Reverse a string")).toBeInTheDocument();
  });

  it("shows an error when loading the exam fails", async () => {
    mockedApi.getCandidateExam.mockRejectedValue(new Error("exam boom"));
    renderApp("/candidate/assignments");
    expect(await screen.findByText("exam boom")).toBeInTheDocument();
  });
});
