import type { SubmissionHistoryItem } from "@oct/contracts";
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
  const selectedSubmission = submissions.find((submission) => submission.id === selectedId) ?? null;

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
            className={submission.id === selectedId ? "submission-history-row submission-history-row-active" : "submission-history-row"}
            key={submission.id}
          >
            <div className="submission-history-main">
              <strong>{submission.problemTitle}</strong>
              <span>{new Date(submission.createdAt).toLocaleString()}</span>
              <small>{submission.id}</small>
            </div>

            <div className="submission-history-meta">
              <span className={`badge ${getStatusBadgeClass(submission.status)}`}>
                {submission.status}
              </span>
              <span>{submission.language}</span>
              <span>{submission.score ?? "--"} / 100</span>
              <span>{submission.passedCases} / {submission.totalCases} cases</span>
            </div>

            <button className="secondary-button icon-button-text" onClick={() => onSelect(submission)} type="button">
              <Eye aria-hidden="true" size={15} />
              <span>View</span>
            </button>
          </div>
        ))}
      </div>

      {selectedSubmission ? (
        <div className="submission-history-detail">
          <div className="result-summary">
            <strong>{selectedSubmission.problemTitle}</strong>
            <span>{selectedSubmission.passedCases} / {selectedSubmission.totalCases} cases</span>
          </div>

          <div className="meta-row">
            <span>{selectedSubmission.candidateName}</span>
            <span>{selectedSubmission.language}</span>
            <span>{selectedSubmission.status}</span>
            <span>{selectedSubmission.score ?? "--"} / 100</span>
          </div>

          {selectedSubmission.result?.errorMessage ? (
            <p className="error-text">{selectedSubmission.result.errorMessage}</p>
          ) : null}

          <div className="submission-detail-grid">
            <pre className="code-snapshot">{selectedSubmission.sourceCode}</pre>

            <div className="case-list">
              {selectedSubmission.result?.cases.map((testCase) => (
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
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getStatusBadgeClass(status: SubmissionHistoryItem["status"]) {
  switch (status) {
    case "finished":
      return "badge-success";
    case "failed":
      return "badge-error";
    case "running":
      return "badge-warning";
    default:
      return "badge-outline";
  }
}
