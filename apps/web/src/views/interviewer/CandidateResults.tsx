import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { reviewRecommendations } from "@oct/contracts";
import type { AuthUser, CandidateReviewContextResponse, InterviewReview, ReviewRecommendation, SubmissionHistoryItem } from "@oct/contracts";
import { deleteCandidateReview, getCandidateReviewContext, getCandidateSubmissionHistory, saveCandidateReview } from "../../lib/api";
import { SubmissionHistoryPanel } from "../SubmissionHistoryPanel";
import { CandidateCombobox, getCandidateLabel } from "./CandidateCombobox";

interface CandidateResultsProps {
  readonly token: string;
  readonly candidates: AuthUser[];
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

  const loadResultsFor = async (candidate: AuthUser) => {
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

  const handleLoadResults = (e: React.FormEvent) => {
    e.preventDefault();

    const candidate = candidates.find(c => getCandidateLabel(c) === candidateInput);
    if (!candidate) {
      setError("Please select a valid candidate from the dropdown list.");
      return;
    }

    void loadResultsFor(candidate);
  };

  const handleCandidateChange = (value: string) => {
    setCandidateInput(value);

    // Auto-load as soon as a candidate is fully selected, so interviewers
    // don't need a separate "View" click.
    const candidate = candidates.find(c => getCandidateLabel(c) === value);
    if (candidate) {
      void loadResultsFor(candidate);
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
            <CandidateCombobox
              candidates={candidates}
              id="results-candidate-options"
              onChange={handleCandidateChange}
              placeholder="Type to search or select a candidate..."
              value={candidateInput}
            />
          </label>
        </div>
      </form>

      {error && <div className="toast toast-error">{error}</div>}

      <div className="results-container mt-lg">
        {loading && (
          <div className="skeleton-list">
            <div className="skeleton-card"></div>
            <div className="skeleton-card"></div>
          </div>
        )}
        {!loading && results && (
          <div className="review-results-layout">
            <CollapsibleSection eyebrow="Private Review" title="Notes and Rubric">
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
            </CollapsibleSection>

            <CollapsibleSection eyebrow="Submission History" title="Submissions">
              <SubmissionHistoryPanel
                emptyMessage="No submissions found for this candidate."
                onSelect={(submission) => setSelectedSubmissionId(submission.id)}
                selectedId={selectedSubmissionId}
                submissions={results.submissions}
                inlineExpand={true}
              />
            </CollapsibleSection>
          </div>
        )}
        {!loading && !results && (
          <div className="empty-state">
            <p>Select a candidate to view their submission history.</p>
          </div>
        )}
      </div>
    </article>
  );
}

function CollapsibleSection({
  eyebrow,
  title,
  defaultOpen = true,
  children
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="review-editor collapsible-section">
      <div className="panel-header collapsible-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <button
          aria-expanded={open}
          aria-label={open ? `Collapse ${eyebrow}` : `Expand ${eyebrow}`}
          className="collapsible-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <ChevronDown
            aria-hidden="true"
            className={open ? "collapsible-chevron collapsible-chevron-open" : "collapsible-chevron"}
            size={18}
          />
        </button>
      </div>
      {open ? children : null}
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
  readonly disabled: boolean;
  readonly form: ReviewFormState;
  readonly hasSavedReview: boolean;
  readonly message: string | null;
  readonly onDelete: () => void;
  readonly onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly onSelectProblem: (problemId: string) => void;
  readonly onUpdate: (form: ReviewFormState) => void;
  readonly problemOptions: CandidateReviewContextResponse["assignments"];
  readonly selectedProblemId: string;
}) {
  return (
    <form className="collapsible-content" onSubmit={onSave}>
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
  readonly label: string;
  readonly onChange: (value: number) => void;
  readonly value: number;
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
