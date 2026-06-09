import { useEffect, useState } from "react";
import { reviewRecommendations } from "@oct/contracts";
import type { AuthUser, CandidateReviewContextResponse, CustomRunDetail, InterviewReview, ReviewRecommendation, SubmissionHistoryItem, SupportedLanguage } from "@oct/contracts";
import { createAdminCustomRun, deleteCandidateReview, getAdminCustomRun, getCandidateReviewContext, getCandidateSubmissionHistory, saveCandidateReview } from "../../lib/api";
import { SubmissionHistoryPanel } from "../SubmissionHistoryPanel";
import { CandidateCombobox, getCandidateLabel } from "./CandidateCombobox";
import Editor from "@monaco-editor/react";

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

            <ScratchRunPanel
              candidate={results.candidate}
              problemId={selectedProblemId}
              token={token}
            />

            <SubmissionHistoryPanel
              emptyMessage="No submissions found for this candidate."
              onSelect={(submission) => setSelectedSubmissionId(submission.id)}
              selectedId={selectedSubmissionId}
              submissions={results.submissions}
              showCodeInline={true}
            />
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

function ScratchRunPanel({
  candidate,
  problemId,
  token
}: {
  readonly candidate: AuthUser;
  readonly problemId: string;
  readonly token: string;
}) {
  const [sourceCode, setSourceCode] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  const [customInput, setCustomInput] = useState("");
  const [customRun, setCustomRun] = useState<CustomRunDetail | null>(null);
  const [customRunLoading, setCustomRunLoading] = useState(false);
  const [customRunError, setCustomRunError] = useState<string | null>(null);

  useEffect(() => {
    setCustomRun(null);
    setCustomInput("");
    setCustomRunError(null);
  }, [candidate.id, problemId]);

  useEffect(() => {
    if (!customRun || !["queued", "running"].includes(customRun.status)) {
      return;
    }

    let cancelled = false;
    let timer!: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const nextRun = await getAdminCustomRun(token, customRun.id);

        if (cancelled) {
          return;
        }

        setCustomRun(nextRun);
        if (["queued", "running"].includes(nextRun.status)) {
          timer = setTimeout(poll, 800);
        }
      } catch (err) {
        if (!cancelled) {
          setCustomRunError(err instanceof Error ? err.message : "Failed to poll custom run");
        }
      }
    };

    timer = setTimeout(poll, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customRun?.id, customRun?.status, token]);

  async function handleCustomRun() {
    if (!problemId) {
      return;
    }

    setCustomRunLoading(true);
    setCustomRunError(null);

    try {
      const created = await createAdminCustomRun(token, {
        candidateId: candidate.id,
        problemId,
        language,
        sourceCode,
        stdin: customInput
      });
      const now = new Date().toISOString();

      setCustomRun({
        id: created.runId,
        candidateId: candidate.id,
        problemId,
        requestedBy: "",
        language,
        sourceCode,
        stdin: customInput,
        status: created.status,
        stdout: null,
        stderr: null,
        errorType: null,
        errorMessage: null,
        executionTimeMs: null,
        createdAt: now,
        updatedAt: now
      });
    } catch (err) {
      setCustomRunError(err instanceof Error ? err.message : "Failed to start custom run");
    } finally {
      setCustomRunLoading(false);
    }
  }

  return (
    <section className="review-editor">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Scratch Terminal</p>
          <h3>Run code for {candidate.name}</h3>
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

      <div className="scratch-run-editor">
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

      <div className="scratch-run-terminal">
        <div className="panel-header compact-panel-header">
          <div>
            <p className="eyebrow">Terminal</p>
            <h3>Run current code</h3>
          </div>
          <button className="chip-button" disabled={!problemId || customRunLoading} onClick={handleCustomRun} type="button">
            {customRunLoading ? "Starting..." : "Run"}
          </button>
        </div>

        <label className="field">
          <span>stdin</span>
          <textarea
            disabled={!problemId}
            onChange={(event) => setCustomInput(event.target.value)}
            placeholder="Input passed to stdin"
            rows={4}
            value={customInput}
          />
        </label>

        {customRunError ? <p className="error-text">{customRunError}</p> : null}

        {customRun ? (
          <div className="terminal-output-grid">
            <div className={`run-status-strip run-status-${customRun.status === "failed" ? "error" : "ok"}`}>
              <span>{customRun.status}</span>
              {customRun.executionTimeMs === null ? null : <span>{customRun.executionTimeMs} ms</span>}
            </div>
            {customRun.errorMessage ? <p className="error-text">{customRun.errorMessage}</p> : null}
            <div>
              <p className="label-text">stdout</p>
              <pre className="terminal-pre">{customRun.stdout ?? (["queued", "running"].includes(customRun.status) ? "Running..." : "")}</pre>
            </div>
            <div>
              <p className="label-text">stderr</p>
              <pre className="terminal-pre">{customRun.stderr ?? ""}</pre>
            </div>
          </div>
        ) : (
          <p className="helper-text">Run code with stdin without creating an official submission.</p>
        )}
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
