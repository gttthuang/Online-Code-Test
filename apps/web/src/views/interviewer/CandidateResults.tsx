import { useEffect, useRef, useState } from "react";
import { reviewRecommendations } from "@oct/contracts";
import type { AuthUser, CandidateReviewContextResponse, InterviewReview, ReviewRecommendation, SubmissionHistoryItem, SupportedLanguage } from "@oct/contracts";
import { deleteCandidateReview, getCandidateReviewContext, getCandidateSubmissionHistory, saveCandidateReview } from "../../lib/api";
import { useLiveRoom } from "../../lib/useLiveRoom";
import { SubmissionHistoryPanel } from "../SubmissionHistoryPanel";
import Editor from "@monaco-editor/react";

interface CandidateResultsProps {
  token: string;
  candidates: AuthUser[];
}

type ReviewFormState = {
  notes: string;
  rubric: {
    problemSolving: number;
    codeQuality: number;
    communication: number;
    testingDebugging: number;
  };
  recommendation: ReviewRecommendation;
};

const emptyReviewForm: ReviewFormState = {
  notes: "",
  rubric: {
    problemSolving: 3,
    codeQuality: 3,
    communication: 3,
    testingDebugging: 3
  },
  recommendation: "lean_hire"
};

const recommendationLabels = {
  strong_hire: "Strong hire",
  hire: "Hire",
  lean_hire: "Lean hire",
  lean_no_hire: "Lean no hire",
  no_hire: "No hire"
} satisfies Record<ReviewRecommendation, string>;

export function CandidateResults({ token, candidates }: CandidateResultsProps) {
  const [candidateInput, setCandidateInput] = useState("");
  const [results, setResults] = useState<{ candidate: AuthUser; submissions: SubmissionHistoryItem[] } | null>(null);
  const [reviewContext, setReviewContext] = useState<CandidateReviewContextResponse | null>(null);
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(emptyReviewForm);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
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
    setReviewContext(null);
    setSelectedProblemId("");
    setReviewForm(emptyReviewForm);
    setReviewMessage(null);
    setSelectedSubmissionId(null);

    try {
      const [historyData, reviewData] = await Promise.all([
        getCandidateSubmissionHistory(token, candidate.id),
        getCandidateReviewContext(token, candidate.id)
      ]);
      const firstProblemId = reviewData.assignments[0]?.problemId ?? historyData.submissions[0]?.problemId ?? "";

      setResults(historyData);
      setReviewContext(reviewData);
      setSelectedProblemId(firstProblemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidate results");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reviewContext || !selectedProblemId) {
      setReviewForm(emptyReviewForm);
      return;
    }

    const currentReview = reviewContext.reviews.find((review) => review.problemId === selectedProblemId);
    setReviewForm(currentReview ? toReviewForm(currentReview) : emptyReviewForm);
  }, [reviewContext, selectedProblemId]);

  async function handleSaveReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!results || !selectedProblemId) {
      return;
    }

    setReviewSaving(true);
    setReviewMessage(null);
    setError(null);

    try {
      const response = await saveCandidateReview(token, results.candidate.id, selectedProblemId, reviewForm);
      setReviewContext((current) => {
        if (!current) {
          return current;
        }

        const reviews = current.reviews.some((review) => review.problemId === response.review.problemId)
          ? current.reviews.map((review) => review.problemId === response.review.problemId ? response.review : review)
          : [...current.reviews, response.review];

        return {
          ...current,
          reviews
        };
      });
      setReviewMessage("Review saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleDeleteReview() {
    if (!results || !selectedProblemId) {
      return;
    }

    setReviewSaving(true);
    setReviewMessage(null);
    setError(null);

    try {
      await deleteCandidateReview(token, results.candidate.id, selectedProblemId);
      setReviewContext((current) => current ? {
        ...current,
        reviews: current.reviews.filter((review) => review.problemId !== selectedProblemId)
      } : current);
      setReviewForm(emptyReviewForm);
      setReviewMessage("Review deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete review");
    } finally {
      setReviewSaving(false);
    }
  }

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
          <div className="review-results-layout">
            <ReviewEditor
              disabled={reviewSaving}
              form={reviewForm}
              hasSavedReview={Boolean(reviewContext?.reviews.some((review) => review.problemId === selectedProblemId))}
              message={reviewMessage}
              onDelete={handleDeleteReview}
              onSave={handleSaveReview}
              onSelectProblem={setSelectedProblemId}
              onUpdate={setReviewForm}
              problemOptions={reviewContext?.assignments ?? []}
              selectedProblemId={selectedProblemId}
            />

            <LiveRoomPanel
              candidate={results.candidate}
              problemId={selectedProblemId}
              token={token}
            />

            <SubmissionHistoryPanel
              emptyMessage="No submissions found for this candidate."
              onSelect={(submission) => setSelectedSubmissionId(submission.id)}
              selectedId={selectedSubmissionId}
              submissions={results.submissions}
            />
          </div>
        ) : (
          <div className="empty-state">
            <p>Select a candidate to view their submission history.</p>
          </div>
        )}
      </div>
    </article>
  );
}

function LiveRoomPanel({
  candidate,
  problemId,
  token
}: {
  candidate: AuthUser;
  problemId: string;
  token: string;
}) {
  const [sourceCode, setSourceCode] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  const suppressNextLiveBroadcastRef = useRef(false);
  const liveRoom = useLiveRoom({
    token,
    candidateId: candidate.id,
    problemId: problemId || null,
    onCodeUpdate: (snapshot) => {
      suppressNextLiveBroadcastRef.current = true;
      setSourceCode(snapshot.sourceCode);
      setLanguage(snapshot.language);
    }
  });

  useEffect(() => {
    if (!problemId || liveRoom.status !== "connected") {
      return;
    }

    if (suppressNextLiveBroadcastRef.current) {
      suppressNextLiveBroadcastRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      liveRoom.sendCodeUpdate(language, sourceCode);
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [language, liveRoom.sendCodeUpdate, liveRoom.status, problemId, sourceCode]);

  return (
    <section className="review-editor live-room-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Live Room</p>
          <h3>{candidate.name}</h3>
          <div className={`live-room-strip live-room-${liveRoom.status}`}>
            <span>{problemId ? liveRoom.status : "select a problem"}</span>
            <span>{liveRoom.participants.length} participant(s)</span>
            {liveRoom.error ? <span>{liveRoom.error}</span> : null}
          </div>
        </div>
      </div>

      <label className="field">
        <span>Language</span>
        <select
          disabled={!problemId}
          onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
          value={language}
        >
          <option value="python">python</option>
          <option value="cpp">cpp</option>
        </select>
      </label>

      <div className="live-room-editor">
        <Editor
          height="260px"
          language={language === "cpp" ? "cpp" : language}
          onChange={(value) => setSourceCode(value ?? "")}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on"
          }}
          theme="light"
          value={sourceCode}
        />
      </div>
    </section>
  );
}

function ReviewEditor({
  disabled,
  form,
  hasSavedReview,
  message,
  onDelete,
  onSave,
  onSelectProblem,
  onUpdate,
  problemOptions,
  selectedProblemId
}: {
  disabled: boolean;
  form: ReviewFormState;
  hasSavedReview: boolean;
  message: string | null;
  onDelete: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelectProblem: (problemId: string) => void;
  onUpdate: (form: ReviewFormState) => void;
  problemOptions: CandidateReviewContextResponse["assignments"];
  selectedProblemId: string;
}) {
  return (
    <form className="review-editor" onSubmit={onSave}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Private Review</p>
          <h3>Notes and rubric</h3>
        </div>
      </div>

      <label className="field">
        <span>Problem</span>
        <select disabled={problemOptions.length === 0 || disabled} onChange={(event) => onSelectProblem(event.target.value)} value={selectedProblemId}>
          {problemOptions.length === 0 ? <option value="">No assigned problems</option> : null}
          {problemOptions.map((assignment) => (
            <option key={assignment.problemId} value={assignment.problemId}>
              {assignment.problemTitle}
            </option>
          ))}
        </select>
      </label>

      <div className="rubric-grid">
        <RubricSlider
          label="Problem solving"
          onChange={(value) => onUpdate({ ...form, rubric: { ...form.rubric, problemSolving: value } })}
          value={form.rubric.problemSolving}
        />
        <RubricSlider
          label="Code quality"
          onChange={(value) => onUpdate({ ...form, rubric: { ...form.rubric, codeQuality: value } })}
          value={form.rubric.codeQuality}
        />
        <RubricSlider
          label="Communication"
          onChange={(value) => onUpdate({ ...form, rubric: { ...form.rubric, communication: value } })}
          value={form.rubric.communication}
        />
        <RubricSlider
          label="Testing/debugging"
          onChange={(value) => onUpdate({ ...form, rubric: { ...form.rubric, testingDebugging: value } })}
          value={form.rubric.testingDebugging}
        />
      </div>

      <label className="field">
        <span>Recommendation</span>
        <select
          disabled={disabled}
          onChange={(event) => onUpdate({ ...form, recommendation: event.target.value as ReviewRecommendation })}
          value={form.recommendation}
        >
          {reviewRecommendations.map((recommendation) => (
            <option key={recommendation} value={recommendation}>
              {recommendationLabels[recommendation]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          disabled={disabled}
          onChange={(event) => onUpdate({ ...form, notes: event.target.value })}
          rows={6}
          value={form.notes}
        />
      </label>

      <div className="modal-actions">
        <button className="primary-button" disabled={disabled || !selectedProblemId} type="submit">
          {disabled ? "Saving..." : "Save Review"}
        </button>
        <button className="secondary-button" disabled={disabled || !hasSavedReview} onClick={onDelete} type="button">
          Delete
        </button>
      </div>

      {message ? <p className="success-text">{message}</p> : null}
    </form>
  );
}

function RubricSlider({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="rubric-slider">
      <span>{label}</span>
      <input max={5} min={1} onChange={(event) => onChange(Number(event.target.value))} type="range" value={value} />
      <strong>{value}</strong>
    </label>
  );
}

function toReviewForm(review: InterviewReview): ReviewFormState {
  return {
    notes: review.notes,
    rubric: review.rubric,
    recommendation: review.recommendation
  };
}
