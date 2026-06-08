import { useEffect, useState } from "react";
import type { ProblemSummary, AuthUser } from "@oct/contracts";
import { useLocation } from "react-router-dom";
import { getAdminProblems, getCandidates } from "../lib/api";

import { CandidateManager } from "./interviewer/CandidateManager";
import { AssignmentForm } from "./interviewer/AssignmentForm";
import { CandidateResults } from "./interviewer/CandidateResults";
import { UserManager } from "./interviewer/UserManager";

interface InterviewerWorkspaceProps {
  readonly currentUserId: string;
  readonly token: string;
}

function resolveActiveSection(pathname: string) {
  if (pathname.includes("/candidates")) {
    return "candidates";
  }
  if (pathname.includes("/results")) {
    return "results";
  }
  if (pathname.includes("/assign")) {
    return "assign";
  }
  if (pathname.includes("/users")) {
    return "users";
  }
  return "dashboard";
}

export function InterviewerWorkspace({ currentUserId, token }: InterviewerWorkspaceProps) {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [candidates, setCandidates] = useState<AuthUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const activeSection = resolveActiveSection(location.pathname);

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
    <div className="workspace-container">
      <header className="workspace-header mb-lg">
        <h1>Interviewer Dashboard</h1>
        <p className="subtitle text-muted">Manage candidates, assign problems, and review performance.</p>
      </header>

      {error && (
        <div className="toast toast-error mb-lg">
          <strong>Workspace Error:</strong> {error}
        </div>
      )}

      {activeSection === "dashboard" ? (
        <section className="workspace-grid interviewer-grid">
          <div className="grid-col-main">
            <div className="grid-row-split mb-lg">
              <CandidateManager token={token} onCandidatesUpdated={setCandidates} />
              <AssignmentForm token={token} candidates={candidates} problems={problems} />
            </div>

            <CandidateResults token={token} candidates={candidates} />
          </div>
        </section>
      ) : null}

      {activeSection === "assign" ? (
        <section className="workspace-grid single-column-grid">
          <AssignmentForm token={token} candidates={candidates} problems={problems} />
        </section>
      ) : null}

      {activeSection === "candidates" ? (
        <section className="workspace-grid single-column-grid">
          <CandidateManager token={token} onCandidatesUpdated={setCandidates} />
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
