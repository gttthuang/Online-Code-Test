import { useState } from "react";
import type { AuthUser, SubmissionHistoryItem } from "@oct/contracts";
import { getCandidateSubmissionHistory } from "../../lib/api";
import { SubmissionHistoryPanel } from "../SubmissionHistoryPanel";

interface CandidateResultsProps {
  token: string;
  candidates: AuthUser[];
}

export function CandidateResults({ token, candidates }: CandidateResultsProps) {
  const [candidateInput, setCandidateInput] = useState("");
  const [results, setResults] = useState<{ candidate: AuthUser; submissions: SubmissionHistoryItem[] } | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
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
    setSelectedSubmissionId(null);

    try {
      const data = await getCandidateSubmissionHistory(token, candidate.id);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidate results");
    } finally {
      setLoading(false);
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
          <SubmissionHistoryPanel
            emptyMessage="No submissions found for this candidate."
            onSelect={(submission) => setSelectedSubmissionId(submission.id)}
            selectedId={selectedSubmissionId}
            submissions={results.submissions}
          />
        ) : (
          <div className="empty-state">
            <p>Select a candidate to view their submission history.</p>
          </div>
        )}
      </div>
    </article>
  );
}
