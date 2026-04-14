import { useEffect, useState } from "react";
import type { CandidateResultsResponse, ProblemSummary } from "@oct/contracts";

import { createAssignment, getAdminProblems, getCandidateResults } from "../lib/api";

interface InterviewerWorkspaceProps {
  token: string;
}

export function InterviewerWorkspace({ token }: InterviewerWorkspaceProps) {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [candidateId, setCandidateId] = useState("candidate_alice");
  const [candidateQuery, setCandidateQuery] = useState("candidate_alice");
  const [results, setResults] = useState<CandidateResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getAdminProblems(token)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setProblems(items);
        setSelectedProblemId((current) => current || items[0]?.id || "");
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load problems");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAssign() {
    if (!selectedProblemId) {
      return;
    }

    setAssigning(true);
    setError(null);

    try {
      await createAssignment(token, {
        candidateId,
        problemId: selectedProblemId
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create assignment");
    } finally {
      setAssigning(false);
    }
  }

  async function handleLoadResults() {
    setLoadingResults(true);
    setError(null);

    try {
      const nextResults = await getCandidateResults(token, candidateQuery);
      setResults(nextResults);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load candidate results");
    } finally {
      setLoadingResults(false);
    }
  }

  return (
    <section className="workspace-grid">
      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Assignment Console</p>
            <h2>Assign a problem to a candidate</h2>
          </div>
        </div>

        <label className="field">
          <span>Candidate ID</span>
          <input onChange={(event) => setCandidateId(event.target.value)} value={candidateId} />
        </label>

        <label className="field">
          <span>Problem</span>
          <select onChange={(event) => setSelectedProblemId(event.target.value)} value={selectedProblemId}>
            {problems.map((problem) => (
              <option key={problem.id} value={problem.id}>
                {problem.title} ({problem.difficulty})
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button" disabled={assigning || !selectedProblemId} onClick={handleAssign} type="button">
          {assigning ? "Assigning..." : "Create Assignment"}
        </button>

        {error ? <p className="error-text">{error}</p> : null}
      </article>

      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Candidate Results</p>
            <h2>Inspect submission status and score</h2>
          </div>
        </div>

        <div className="inline-form">
          <label className="field">
            <span>Candidate ID</span>
            <input onChange={(event) => setCandidateQuery(event.target.value)} value={candidateQuery} />
          </label>

          <button className="secondary-button" disabled={loadingResults} onClick={handleLoadResults} type="button">
            {loadingResults ? "Loading..." : "Load Results"}
          </button>
        </div>

        {results ? (
          <div className="result-table">
            {results.submissions.map((submission) => (
              <div className="table-row" key={submission.submissionId}>
                <div>
                  <strong>{submission.problemTitle}</strong>
                  <small>{submission.submissionId}</small>
                </div>
                <span>{submission.status}</span>
                <span>{submission.score ?? "--"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">Load a candidate to see submission history.</div>
        )}
      </article>
    </section>
  );
}
