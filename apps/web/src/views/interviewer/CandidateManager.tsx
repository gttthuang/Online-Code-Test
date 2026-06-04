import { useState, useEffect } from "react";
import type { AuthUser } from "@oct/contracts";
import { getCandidates, createCandidate, deleteCandidate } from "../../lib/api";

interface CandidateManagerProps {
  readonly token: string;
  readonly onCandidatesUpdated: (candidates: AuthUser[]) => void;
}

export function CandidateManager({ token, onCandidatesUpdated }: CandidateManagerProps) {
  const [candidates, setCandidates] = useState<AuthUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchCandidates = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getCandidates(token);
      setCandidates(items);
      onCandidatesUpdated(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await createCandidate(token, { name, email });
      setSuccess(`Candidate ${name} created successfully!`);
      setName("");
      setEmail("");
      await fetchCandidates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create candidate");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (candidateId: string) => {
    if (!globalThis.confirm("Are you sure you want to delete this candidate?")) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteCandidate(token, candidateId);
      setSuccess("Candidate deleted successfully!");
      await fetchCandidates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete candidate");
      setLoading(false);
    }
  };

  const filteredCandidates = candidates.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <article className="status-card panel-column fade-in">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Candidate Management</p>
          <h2>Manage Candidates</h2>
        </div>
      </div>

      <form onSubmit={handleCreate} className="candidate-form">
        <div className="form-row">
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              placeholder="e.g., David Candidate"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              placeholder="e.g., david@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        </div>
        <button 
          className="primary-button submit-btn" 
          disabled={creating || !name || !email} 
          type="submit"
        >
          {creating ? "Creating..." : "Create Candidate"}
        </button>
      </form>

      {error && <div className="toast toast-error">{error}</div>}
      {success && <div className="toast toast-success">{success}</div>}

      <div className="candidate-list-container mt-md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="mb-sm">
          <p className="eyebrow" style={{ margin: 0 }}>Existing Candidates</p>
          <input 
            type="text" 
            placeholder="Search candidates..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              padding: '6px 12px', 
              borderRadius: '6px', 
              border: '1px solid var(--border)', 
              fontSize: '14px',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
              width: '200px'
            }}
          />
        </div>
        {loading && (
          <div className="skeleton-list">
            <div className="skeleton-item"></div>
            <div className="skeleton-item"></div>
            <div className="skeleton-item"></div>
          </div>
        )}
        {!loading && filteredCandidates.length > 0 && (
          <ul className="candidate-list">
            {filteredCandidates.map((c) => (
              <li key={c.id} className="candidate-item">
                <div className="candidate-info">
                  <span className="candidate-name">{c.name}</span>
                  <span className="candidate-email">{c.email}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="badge badge-outline">{c.id}</span>
                  <button 
                    className="danger-button text-sm" 
                    onClick={() => handleDelete(c.id)}
                    style={{ padding: '4px 8px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && filteredCandidates.length === 0 && (
          <div className="empty-state">No candidates found matching "{searchQuery}".</div>
        )}
      </div>
    </article>
  );
}
