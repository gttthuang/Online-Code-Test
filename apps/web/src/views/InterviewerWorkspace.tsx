import { useEffect, useState } from "react";
import type { ProblemSummary, AuthUser } from "@oct/contracts";
import { useLocation } from "react-router-dom";
import { getAdminProblems, getCandidates } from "../lib/api";

import { AssignmentForm } from "./interviewer/AssignmentForm";
import { CandidateResults } from "./interviewer/CandidateResults";
import { UserManager } from "./interviewer/UserManager";

interface InterviewerWorkspaceProps {
  readonly currentUserId: string;
  readonly token: string;
}

function resolveActiveSection(pathname: string) {
  if (pathname.includes("/results")) {
    return "results";
  }
  if (pathname.includes("/users")) {
    return "users";
  }
  return "assign";
}

const sectionHeadings = {
  assign: { title: "Assign", subtitle: "Assign problems to candidates and set their time limit." },
  results: { title: "Results", subtitle: "Review candidate submissions, run scratch code, and record reviews." },
  users: { title: "Users", subtitle: "Manage accounts and roles." }
} satisfies Record<string, { title: string; subtitle: string }>;

export function InterviewerWorkspace({ currentUserId, token }: InterviewerWorkspaceProps) {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [candidates, setCandidates] = useState<AuthUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const activeSection = resolveActiveSection(location.pathname);
  const heading = sectionHeadings[activeSection];
  // Users fits the viewport so only its inner user list scrolls.
  // Assign and Results scroll the page (Assign's problem list is bounded with
  // its own scroll; Results keeps internal scroll areas).
  const fitViewport = activeSection === "users";

  useEffect(() => {
    let cancelled = false;

    // Fetch initial data needed across the workspace
    Promise.all([
      getAdminProblems(token),
      getCandidates(token).catch(() => []) // It's okay if this fails initially, or we handle it gracefully
    ])
      .then(([problemsData, candidatesData]) => {
        if (!cancelled) {
          setProblems(problemsData);
          setCandidates(candidatesData);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load workspace data");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className={fitViewport ? "workspace-container workspace-fit" : "workspace-container"}>
      <header className="workspace-header mb-lg">
        <h1>{heading.title}</h1>
        <p className="subtitle text-muted">{heading.subtitle}</p>
      </header>

      {error && (
        <div className="toast toast-error mb-lg">
          <strong>Workspace Error:</strong> {error}
        </div>
      )}

      {activeSection === "assign" ? (
        <section className="workspace-grid single-column-grid">
          <AssignmentForm token={token} candidates={candidates} problems={problems} />
        </section>
      ) : null}

      {activeSection === "results" ? (
        <section className="workspace-grid single-column-grid">
          <CandidateResults token={token} candidates={candidates} />
        </section>
      ) : null}

      {activeSection === "users" ? (
        <section className="workspace-grid single-column-grid">
          <UserManager currentUserId={currentUserId} token={token} />
        </section>
      ) : null}
    </div>
  );
}
