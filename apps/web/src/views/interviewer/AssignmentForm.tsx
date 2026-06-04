import { useState } from "react";
import type { AuthUser, ProblemSummary } from "@oct/contracts";
import { createAssignment } from "../../lib/api";

interface AssignmentFormProps {
  readonly token: string;
  readonly candidates: AuthUser[];
  readonly problems: ProblemSummary[];
}

export function AssignmentForm({ token, candidates, problems }: AssignmentFormProps) {
  const [candidateInput, setCandidateInput] = useState("");
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState("all");

  const getCandidateLabel = (c: AuthUser) => `${c.name} (${c.email})`;
  const activeProblems = problems.filter((problem) => 
    !problem.archivedAt && (difficultyFilter === "all" || problem.difficulty === difficultyFilter)
  );

  function toggleProblem(problemId: string) {
    setSelectedProblemIds((current) =>
      current.includes(problemId)
        ? current.filter((id) => id !== problemId)
        : [...current, problemId]
    );
  }

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const candidate = candidates.find(c => getCandidateLabel(c) === candidateInput);

    if (!candidate || selectedProblemIds.length === 0) {
      setError("Please select a valid candidate and at least one problem.");
      return;
    }

    setAssigning(true);
    setError(null);
    setSuccess(null);

    try {
      await createAssignment(token, {
        candidateId: candidate.id,
        problemIds: selectedProblemIds,
        durationMinutes
      });
      
      setSuccess(`Assigned ${selectedProblemIds.length} problem${selectedProblemIds.length === 1 ? "" : "s"} to ${candidate.name} for ${durationMinutes} minutes.`);
      
      setCandidateInput("");
      setSelectedProblemIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create assignment");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <article className="status-card panel-column fade-in">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Assignment Console</p>
          <h2>Assign Problem</h2>
        </div>
      </div>

      <form onSubmit={handleAssign} className="assignment-form mt-md">
        <label className="field">
          <span>Candidate</span>
          <input 
            type="text" 
            list="candidate-list"
            placeholder="Type to search or select a candidate..." 
            value={candidateInput}
            onChange={(e) => setCandidateInput(e.target.value)}
          />
          <datalist id="candidate-list">
            {candidates.map((c) => (
              <option key={c.id} value={getCandidateLabel(c)} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>Time Limit (minutes)</span>
          <input
            max={480}
            min={1}
            onChange={(e) => setDurationMinutes(Number(e.target.value || 0))}
            type="number"
            value={durationMinutes}
          />
        </label>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span>Problems</span>
            <select 
              value={difficultyFilter} 
              onChange={(e) => setDifficultyFilter(e.target.value)}
              style={{ width: 'auto', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color, #ccc)' }}
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div className="problem-checkbox-list">
            {activeProblems.length === 0 ? (
              <div className="empty-state">No active problems available.</div>
            ) : (
              activeProblems.map((problem) => (
                <label className="problem-checkbox-row" key={problem.id}>
                  <input
                    aria-label={problem.title}
                    checked={selectedProblemIds.includes(problem.id)}
                    onChange={() => toggleProblem(problem.id)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{problem.title}</strong>
                    <small>{problem.id} · {problem.difficulty.toUpperCase()}</small>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <button 
          className="primary-button submit-btn mt-md" 
          disabled={assigning || !candidateInput || selectedProblemIds.length === 0 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480}
          type="submit"
        >
          {assigning ? (
            <>
              <span className="spinner-small"></span> Assigning...
            </>
          ) : "Create Assignment"}
        </button>
      </form>

      {error && <div className="toast toast-error">{error}</div>}
      {success && <div className="toast toast-success">{success}</div>}
    </article>
  );
}
