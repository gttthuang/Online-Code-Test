import type { SubmissionHistoryItem } from "@oct/contracts";
import { useState } from "react";
import { Eye } from "lucide-react";

interface SubmissionHistoryPanelProps {
  emptyMessage: string;
  loading?: boolean;
  onSelect: (submission: SubmissionHistoryItem) => void;
  selectedId?: string | null;
  submissions: SubmissionHistoryItem[];
  showCodeInline?: boolean;
}

export function SubmissionHistoryPanel({
  emptyMessage,
  loading = false,
  onSelect,
  selectedId,
  submissions,
  showCodeInline
}: SubmissionHistoryPanelProps) {
  const [activeSubmission, setActiveSubmission] = useState<SubmissionHistoryItem | null>(null);
  const activeId = activeSubmission?.id ?? selectedId;

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
        {submissions.map((submission) => (
          <div key={submission.id}>
            <div
              className={submission.id === activeId ? "submission-history-row submission-history-row-active" : "submission-history-row"}
            >
              <div className="submission-history-main">
                <strong>{submission.problemTitle}</strong>
                <span>{new Date(submission.createdAt).toLocaleString()}</span>
                {/* <small>{submission.id}</small> */}
              </div>

              <div className="submission-history-meta">
                {(() => {
                  const verdict = getSubmissionVerdict(submission);
                  return <span className={`badge ${verdict.className}`}>{verdict.label}</span>;
                })()}
                <span>{submission.language}</span>
                <span>{submission.passedCases} / {submission.totalCases} cases</span>
              </div>

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
            </div>
            {showCodeInline && (
              <div className="submission-history-code-inline mt-sm mb-lg">
                <pre className="code-snapshot">{submission.sourceCode}</pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {activeSubmission ? (
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

            <div className="result-summary">
              <strong>{activeSubmission.passedCases} / {activeSubmission.totalCases} cases</strong>
              <span>{activeSubmission.score ?? "--"} / 100</span>
            </div>

            <div className="meta-row submission-modal-meta">
              <span>{activeSubmission.candidateName}</span>
              <span>{activeSubmission.language}</span>
              <span>{new Date(activeSubmission.createdAt).toLocaleString()}</span>
              {(() => {
                const verdict = getSubmissionVerdict(activeSubmission);
                return <span className={`badge ${verdict.className}`}>{verdict.label}</span>;
              })()}
            </div>

            {activeSubmission.result?.errorMessage ? (
              <p className="error-text">{activeSubmission.result.errorMessage}</p>
            ) : null}

            <div className="submission-detail-grid submission-modal-grid">
              <div>
                <p className="label-text">Code</p>
                <pre className="code-snapshot submission-modal-code">{activeSubmission.sourceCode}</pre>
              </div>

              <div>
                <p className="label-text">Result</p>
                <div className="case-list">
                  {activeSubmission.result?.cases.length ? (
                    activeSubmission.result.cases.map((testCase) => (
                      <div className="case-item" key={testCase.testCaseId}>
                        <div>
                          <strong>{testCase.testCaseId}</strong>
                          <small>
                            {testCase.executionTimeMs} ms / {testCase.memoryKb} KB
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
          </div>
        </div>
      ) : null}
    </div>
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

export function getSubmissionVerdict(submission: SubmissionHistoryItem): SubmissionVerdict {
  // Judge still queued or running -> Pending (yellow/orange)
  if (submission.status === "queued" || submission.status === "running") {
    return { kind: "pending", label: "Pending", className: "badge-warning" };
  }

  // Judge ran to completion -> Accepted if every case passed, otherwise Wrong Answer
  if (submission.status === "finished") {
    if (submission.totalCases > 0 && submission.passedCases === submission.totalCases) {
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
