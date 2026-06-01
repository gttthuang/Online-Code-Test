import { useState } from "react";
import type { AuthUser, ProblemSummary } from "@oct/contracts";
import { createAssignment } from "../../lib/api";

interface AssignmentFormProps {
  token: string;
  candidates: AuthUser[];
  problems: ProblemSummary[];
}

export function AssignmentForm({ token, candidates, problems }: AssignmentFormProps) {
  const [candidateInput, setCandidateInput] = useState("");
  const [problemInput, setProblemInput] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getCandidateLabel = (c: AuthUser) => `${c.name} (${c.email})`;
  const getProblemLabel = (p: ProblemSummary) => `${p.title} - ${p.difficulty.toUpperCase()}`;
  const activeProblems = problems.filter((problem) => !problem.archivedAt);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const candidate = candidates.find(c => getCandidateLabel(c) === candidateInput);
    const problem = activeProblems.find(p => getProblemLabel(p) === problemInput);

    if (!candidate || !problem) {
      setError("Please select a valid candidate and problem from the dropdown list.");
      return;
    }

    setAssigning(true);
    setError(null);
    setSuccess(null);

    try {
      await createAssignment(token, {
        candidateId: candidate.id,
        problemId: problem.id
      });
      
      setSuccess(`Assigned "${problem.title}" to ${candidate.name} successfully!`);
      
      // Optionally reset form
      setCandidateInput("");
      setProblemInput("");
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
          <span>Problem</span>
          <input 
            type="text" 
            list="problem-list"
            placeholder="Type to search or select a problem..." 
            value={problemInput}
            onChange={(e) => setProblemInput(e.target.value)}
          />
          <datalist id="problem-list">
            {activeProblems.map((p) => (
              <option key={p.id} value={getProblemLabel(p)} />
            ))}
          </datalist>
        </label>

        <button 
          className="primary-button submit-btn mt-md" 
          disabled={assigning || !candidateInput || !problemInput} 
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
