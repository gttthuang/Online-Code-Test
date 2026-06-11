import type { JudgeResult, SubmissionDetail, SubmissionHistoryItem, SubmissionStatus } from "@oct/contracts";
import { useState } from "react";
import { ChevronDown, Eye } from "lucide-react";

interface SubmissionHistoryPanelProps {
  readonly emptyMessage: string;
  readonly loading?: boolean;
  readonly onSelect: (submission: SubmissionHistoryItem) => void;
  readonly selectedId?: string | null;
  readonly submissions: SubmissionHistoryItem[];
  readonly showCodeInline?: boolean;
  /**
   * When true, each row expands its full detail (code, per-case results, meta)
   * inline as a collapsible block instead of opening the View modal.
   */
  readonly inlineExpand?: boolean;
}

export function SubmissionHistoryPanel({
  emptyMessage,
  loading = false,
  onSelect,
  selectedId,
  submissions,
  showCodeInline,
  inlineExpand = false
}: SubmissionHistoryPanelProps) {
  const [activeSubmission, setActiveSubmission] = useState<SubmissionHistoryItem | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const activeId = activeSubmission?.id ?? selectedId;

  const toggleExpanded = (submission: SubmissionHistoryItem) => {
    const willExpand = !expandedIds.has(submission.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(submission.id)) {
        next.delete(submission.id);
      } else {
        next.add(submission.id);
      }
      return next;
    });
    if (willExpand) {
      onSelect(submission);
    }
  };

  if (loading) {
    return (
      <div className="skeleton-list">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (submissions.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="submission-history-layout">
      <div className="submission-history-list">
        {submissions.map((submission) => {
          const verdict = getSubmissionVerdict(submission);
          const expanded = inlineExpand && expandedIds.has(submission.id);
          const rowActive = inlineExpand ? expanded : submission.id === activeId;
          return (
            <div key={submission.id}>
              <div
                className={rowActive ? "submission-history-row submission-history-row-active" : "submission-history-row"}
              >
                <div className="submission-history-main">
                  <strong>{submission.problemTitle}</strong>
                  <span>{new Date(submission.createdAt).toLocaleString()}</span>
                </div>

                <div className="submission-history-meta">
                  <span className={`badge ${verdict.className}`}>{verdict.label}</span>
                  <span>{submission.language}</span>
                  <span>{submission.passedCases} / {submission.totalCases} cases</span>
                </div>

                {inlineExpand ? (
                  <button
                    aria-expanded={expanded}
                    className="secondary-button icon-button-text"
                    onClick={() => toggleExpanded(submission)}
                    type="button"
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={expanded ? "collapsible-chevron collapsible-chevron-open" : "collapsible-chevron"}
                      size={15}
                    />
                    <span>{expanded ? "Hide" : "View"}</span>
                  </button>
                ) : (
                  <button
                    className="secondary-button icon-button-text"
                    onClick={() => {
                      setActiveSubmission(submission);
                      onSelect(submission);
                    }}
                    type="button"
                  >
                    <Eye aria-hidden="true" size={15} />
                    <span>View</span>
                  </button>
                )}
              </div>

              {inlineExpand && expanded ? (
                <div className="submission-history-detail mt-sm mb-lg">
                  <SubmissionDetailBody submission={submission} variant="inline" />
                </div>
              ) : null}

              {!inlineExpand && showCodeInline && (
                <div className="submission-history-code-inline mt-sm mb-lg">
                  <pre className="code-snapshot">{submission.sourceCode}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!inlineExpand && activeSubmission ? (
        <div className="modal-backdrop submission-modal-backdrop">
          <button
            aria-label="Close submission detail"
            className="modal-overlay-button"
            onClick={() => setActiveSubmission(null)}
            type="button"
          />
          <div className="modal modal-wide submission-modal">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Submission Detail</p>
                <h2>{activeSubmission.problemTitle}</h2>
              </div>
              <button className="chip-button" onClick={() => setActiveSubmission(null)} type="button">
                Close
              </button>
            </div>

            <SubmissionDetailBody submission={activeSubmission} variant="modal" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SubmissionDetailBody({
  submission,
  variant
}: {
  readonly submission: SubmissionHistoryItem;
  readonly variant: "modal" | "inline";
}) {
  const verdict = getSubmissionVerdict(submission);
  const isModal = variant === "modal";
  return (
    <>
      <div className="result-summary">
        <strong>{submission.passedCases} / {submission.totalCases} cases</strong>
        <span>{submission.score ?? "--"} / 100</span>
      </div>

      <div className={isModal ? "meta-row submission-modal-meta" : "meta-row submission-detail-meta"}>
        <span>{submission.candidateName}</span>
        <span>{submission.language}</span>
        <span>{new Date(submission.createdAt).toLocaleString()}</span>
        <span className={`badge ${verdict.className}`}>{verdict.label}</span>
      </div>

      {submission.result?.errorMessage ? (
        <div className="error-block" role="alert">
          <p className="error-block-title">{verdict.label}</p>
          <pre className="error-block-message">{submission.result.errorMessage}</pre>
        </div>
      ) : null}

      <div className={isModal ? "submission-detail-grid submission-modal-grid" : "submission-detail-grid"}>
        <div>
          <p className="label-text">Code</p>
          <pre className={isModal ? "code-snapshot submission-modal-code" : "code-snapshot"}>{submission.sourceCode}</pre>
        </div>

        <div>
          <p className="label-text">Result</p>
          <div className="case-list">
            {submission.result?.cases.length ? (
              submission.result.cases.map((testCase) => (
                <div className="case-item" key={testCase.testCaseId}>
                  <div className="case-item-info">
                    <strong>{testCase.testCaseId}</strong>
                    <small>
                      {testCase.executionTimeMs} ms · {testCase.memoryKb} KB
                    </small>
                  </div>
                  <span className={testCase.passed ? "case-pass" : "case-fail"}>
                    {testCase.passed ? "PASS" : "FAIL"}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state">Judge result is not available yet.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export type VerdictKind =
  | "pending"
  | "accepted"
  | "wrong_answer"
  | "time_limit_exceeded"
  | "runtime_error"
  | "compile_error"
  | "system_error"
  | "failed";

export interface SubmissionVerdict {
  kind: VerdictKind;
  label: string;
  className: string;
}

// Accepts either a full history item (with pre-computed case counts) or a bare
// SubmissionDetail (case counts derived from the judge result), so the same
// verdict logic backs both the history panel and the live output block.
type VerdictInput = Pick<SubmissionDetail, "status" | "result"> & {
  status: SubmissionStatus;
  passedCases?: number;
  totalCases?: number;
  result?: JudgeResult | null;
};

export function getSubmissionVerdict(submission: VerdictInput): SubmissionVerdict {
  // Judge still queued or running -> Pending (yellow/orange)
  if (submission.status === "queued" || submission.status === "running") {
    return { kind: "pending", label: "Pending", className: "badge-warning" };
  }

  const totalCases = submission.totalCases ?? submission.result?.cases.length ?? 0;
  const passedCases =
    submission.passedCases ?? submission.result?.cases.filter((testCase) => testCase.passed).length ?? 0;

  // Judge ran to completion -> Accepted if every case passed, otherwise Wrong Answer
  if (submission.status === "finished") {
    if (totalCases > 0 && passedCases === totalCases) {
      return { kind: "accepted", label: "Accepted", className: "badge-success" };
    }
    return { kind: "wrong_answer", label: "Wrong Answer", className: "badge-error" };
  }

  // Judge failed -> map the failure type to a specific verdict (all red)
  const failure = getFailureVerdict(submission.result?.errorType);
  return { ...failure, className: "badge-error" };
}

function getFailureVerdict(
  errorType: NonNullable<SubmissionHistoryItem["result"]>["errorType"]
): { kind: VerdictKind; label: string } {
  switch (errorType) {
    case "time_limit_exceeded":
      return { kind: "time_limit_exceeded", label: "Time Limit Exceeded" };
    case "runtime_error":
      return { kind: "runtime_error", label: "Runtime Error" };
    case "compile_error":
      return { kind: "compile_error", label: "Compile Error" };
    case "sandbox_error":
    case "system_error":
      return { kind: "system_error", label: "System Error" };
    default:
      return { kind: "failed", label: "Failed" };
  }
}

// Verdict options offered in filter dropdowns, in the order they should appear.
export const verdictFilterOptions: ReadonlyArray<{ value: VerdictKind; label: string }> = [
  { value: "accepted", label: "Accepted" },
  { value: "wrong_answer", label: "Wrong Answer" },
  { value: "time_limit_exceeded", label: "Time Limit Exceeded" },
  { value: "runtime_error", label: "Runtime Error" },
  { value: "compile_error", label: "Compile Error" },
  { value: "system_error", label: "System Error" },
  { value: "pending", label: "Pending" }
];
