import type { SubmissionHistoryItem } from "@oct/contracts";
import { useState } from "react";
import { Eye } from "lucide-react";

interface SubmissionHistoryPanelProps {
  emptyMessage: string;
  loading?: boolean;
  onSelect: (submission: SubmissionHistoryItem) => void;
  selectedId?: string | null;
  submissions: SubmissionHistoryItem[];
}

export function SubmissionHistoryPanel({
  emptyMessage,
  loading = false,
  onSelect,
  selectedId,
  submissions
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
          <div
            className={submission.id === activeId ? "submission-history-row submission-history-row-active" : "submission-history-row"}
            key={submission.id}
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
        ))}
      </div>

      {activeSubmission ? (
        <div className="modal-backdrop submission-modal-backdrop" onClick={() => setActiveSubmission(null)}>
          <div className="modal modal-wide submission-modal" onClick={(event) => event.stopPropagation()}>
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

interface SubmissionVerdict {
  label: string;
  className: string;
}

function getSubmissionVerdict(submission: SubmissionHistoryItem): SubmissionVerdict {
  // Judge still queued or running -> Pending (yellow/orange)
  if (submission.status === "queued" || submission.status === "running") {
    return { label: "Pending", className: "badge-warning" };
  }

  // Judge ran to completion -> Accepted if every case passed, otherwise Wrong Answer
  if (submission.status === "finished") {
    if (submission.totalCases > 0 && submission.passedCases === submission.totalCases) {
      return { label: "Accepted", className: "badge-success" };
    }
    return { label: "Wrong Answer", className: "badge-error" };
  }

  // Judge failed -> map the failure type to a specific verdict (all red)
  return { label: getFailureLabel(submission.result?.errorType), className: "badge-error" };
}

function getFailureLabel(errorType: NonNullable<SubmissionHistoryItem["result"]>["errorType"]): string {
  switch (errorType) {
    case "time_limit_exceeded":
      return "Time Limit Exceeded";
    case "runtime_error":
      return "Runtime Error";
    case "compile_error":
      return "Compile Error";
    case "sandbox_error":
    case "system_error":
      return "System Error";
    default:
      return "Failed";
  }
}
