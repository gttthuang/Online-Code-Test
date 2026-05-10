import { useState } from "react";
import type { CandidateResultsResponse, AuthUser } from "@oct/contracts";
import { getCandidateResults } from "../../lib/api";

interface CandidateResultsProps {
  token: string;
  candidates: AuthUser[];
}

export function CandidateResults({ token, candidates }: CandidateResultsProps) {
  const [candidateInput, setCandidateInput] = useState("");
  const [results, setResults] = useState<CandidateResultsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCandidateLabel = (c: AuthUser) => `${c.name} (${c.email})`;

  const handleLoadResults = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const candidate = candidates.find(c => getCandidateLabel(c) === candidateInput);
    if (!candidate) {
      setError("Please select a valid candidate from the dropdown list.");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await getCandidateResults(token, candidate.id);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidate results");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "finished": return "badge-success";
      case "failed": return "badge-error";
      case "running": return "badge-warning";
      default: return "badge-outline";
    }
  };

  return (
    <article className="status-card panel-column fade-in">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Candidate Results</p>
          <h2>Submission History</h2>
        </div>
      </div>

      <form onSubmit={handleLoadResults} className="results-form mt-md">
        <div className="inline-form">
          <label className="field flex-grow">
            <input 
              type="text" 
              list="results-candidate-list"
              placeholder="Type to search or select a candidate..." 
              value={candidateInput}
              onChange={(e) => setCandidateInput(e.target.value)}
            />
            <datalist id="results-candidate-list">
              {candidates.map((candidate) => (
                <option key={candidate.id} value={getCandidateLabel(candidate)} />
              ))}
            </datalist>
          </label>
          <button 
            className="secondary-button" 
            disabled={loading || !candidateInput} 
            type="submit"
          >
            {loading ? "Loading..." : "View"}
          </button>
        </div>
      </form>

      {error && <div className="toast toast-error">{error}</div>}

      <div className="results-container mt-lg">
        {loading ? (
          <div className="skeleton-list">
            <div className="skeleton-card"></div>
            <div className="skeleton-card"></div>
          </div>
        ) : results ? (
          results.submissions.length > 0 ? (
            <div className="result-grid">
              {results.submissions.map((sub) => (
                <div className="result-card" key={sub.submissionId}>
                  <div className="result-card-header">
                    <h3 className="problem-title">{sub.problemTitle}</h3>
                    <span className={`badge ${getStatusBadgeClass(sub.status)}`}>
                      {sub.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="result-card-body">
                    <div className="stat-row">
                      <span className="stat-label">Score</span>
                      <span className={`stat-value ${sub.score === 100 ? 'text-success' : sub.score === 0 ? 'text-error' : ''}`}>
                        {sub.score ?? "--"} / 100
                      </span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Submitted</span>
                      <span className="stat-value text-muted">
                        {new Date(sub.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <p>No submissions found for this candidate.</p>
            </div>
          )
        ) : (
          <div className="empty-state">
            <p>Select a candidate to view their submission history.</p>
          </div>
        )}
      </div>
    </article>
  );
}
