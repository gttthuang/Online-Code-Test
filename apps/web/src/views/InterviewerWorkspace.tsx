import { useEffect, useState } from "react";
import type { ProblemSummary, AuthUser } from "@oct/contracts";
import { getAdminProblems, getCandidates } from "../lib/api";

import { CandidateManager } from "./interviewer/CandidateManager";
import { AssignmentForm } from "./interviewer/AssignmentForm";
import { CandidateResults } from "./interviewer/CandidateResults";

interface InterviewerWorkspaceProps {
  token: string;
}

export function InterviewerWorkspace({ token }: InterviewerWorkspaceProps) {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [candidates, setCandidates] = useState<AuthUser[]>([]);
  const [error, setError] = useState<string | null>(null);

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

      <section className="workspace-grid interviewer-grid">
        <div className="grid-col-main">
          {/* Top section: Assignment and Management */}
          <div className="grid-row-split mb-lg">
            <CandidateManager 
              token={token} 
              onCandidatesUpdated={setCandidates} 
            />
            <AssignmentForm 
              token={token} 
              candidates={candidates} 
              problems={problems} 
            />
          </div>
          
          {/* Bottom section: Results */}
          <CandidateResults 
            token={token} 
            candidates={candidates} 
          />
        </div>
      </section>
    </div>
  );
}
