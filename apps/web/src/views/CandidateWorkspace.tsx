import { useEffect, useState } from "react";
import type { AssignmentSummary, AuthUser, ProblemDetail, SubmissionDetail, SupportedLanguage } from "@oct/contracts";

import { createSubmission, getAssignments, getProblem, getSubmission } from "../lib/api";

const scenarioTemplates = [
  {
    label: "Accepted",
    code: "print(42)"
  },
  {
    label: "Wrong Answer",
    code: "wrong_answer"
  },
  {
    label: "Compile Error",
    code: "compile_error"
  },
  {
    label: "Runtime Error",
    code: "runtime_error"
  }
];

interface CandidateWorkspaceProps {
  token: string;
  user: AuthUser;
}

export function CandidateWorkspace({ token, user }: CandidateWorkspaceProps) {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [problemLoading, setProblemLoading] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [sourceCode, setSourceCode] = useState("print(42)");
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setAssignmentsLoading(true);
    setWorkspaceError(null);

    getAssignments(token)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setAssignments(items);
        setSelectedProblemId((current) => current ?? items[0]?.problemId ?? null);
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceError(error instanceof Error ? error.message : "Failed to load assignments");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAssignmentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!selectedProblemId) {
      setProblem(null);
      return;
    }

    let cancelled = false;

    setProblemLoading(true);
    setWorkspaceError(null);

    getProblem(token, selectedProblemId)
      .then((nextProblem) => {
        if (cancelled) {
          return;
        }

        setProblem(nextProblem);
        setLanguage((current) =>
          nextProblem.supportedLanguages.includes(current) ? current : nextProblem.supportedLanguages[0]
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceError(error instanceof Error ? error.message : "Failed to load problem");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProblemLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProblemId, token]);

  useEffect(() => {
    if (!submission || !["queued", "running"].includes(submission.status)) {
      return;
    }

    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      try {
        const nextSubmission = await getSubmission(token, submission.id);

        if (cancelled) {
          return;
        }

        setSubmission(nextSubmission);

        if (["queued", "running"].includes(nextSubmission.status)) {
          timer = window.setTimeout(poll, 1000);
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceError(error instanceof Error ? error.message : "Failed to poll submission");
        }
      }
    };

    timer = window.setTimeout(poll, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [submission, token]);

  async function handleSubmit() {
    if (!problem) {
      return;
    }

    setSubmissionLoading(true);
    setWorkspaceError(null);

    try {
      const created = await createSubmission(token, {
        problemId: problem.id,
        language,
        sourceCode
      });

      setSubmission({
        id: created.submissionId,
        candidateId: user.id,
        problemId: problem.id,
        language,
        status: created.status,
        sourceCode,
        score: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: null
      });
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Failed to create submission");
    } finally {
      setSubmissionLoading(false);
    }
  }

  return (
    <section className="workspace-grid workspace-grid-wide">
      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Assignments</p>
            <h2>{assignmentsLoading ? "Loading..." : `${assignments.length} problem(s)`}</h2>
          </div>
        </div>

        <div className="assignment-list">
          {assignments.map((assignment) => (
            <button
              key={assignment.id}
              className={`assignment-item ${selectedProblemId === assignment.problemId ? "assignment-item-active" : ""}`}
              onClick={() => setSelectedProblemId(assignment.problemId)}
              type="button"
            >
              <strong>{assignment.problemTitle}</strong>
              <span>{assignment.difficulty}</span>
              <small>
                Latest status: {assignment.latestSubmissionStatus ? assignment.latestSubmissionStatus : "none"}
              </small>
            </button>
          ))}

          {!assignmentsLoading && assignments.length === 0 ? (
            <div className="empty-state">No assignments yet.</div>
          ) : null}
        </div>
      </article>

      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Problem</p>
            <h2>{problemLoading ? "Loading problem..." : problem?.title ?? "Select an assignment"}</h2>
          </div>
        </div>

        {problem ? (
          <div className="problem-stack">
            <p className="panel-copy">{problem.description}</p>

            <div className="meta-row">
              <span>Difficulty: {problem.difficulty}</span>
              <span>Time: {problem.timeLimitMs} ms</span>
              <span>Memory: {problem.memoryLimitKb} KB</span>
            </div>

            <div className="sample-grid">
              <div>
                <p className="label-text">Sample Input</p>
                <pre>{problem.sampleInput}</pre>
              </div>

              <div>
                <p className="label-text">Sample Output</p>
                <pre>{problem.sampleOutput}</pre>
              </div>
            </div>

            <div className="editor-toolbar">
              <label className="field field-inline">
                <span>Language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}>
                  {problem.supportedLanguages.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <div className="scenario-row">
                {scenarioTemplates.map((scenario) => (
                  <button
                    key={scenario.label}
                    className="chip-button"
                    onClick={() => setSourceCode(scenario.code)}
                    type="button"
                  >
                    {scenario.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              className="code-editor"
              onChange={(event) => setSourceCode(event.target.value)}
              spellCheck={false}
              value={sourceCode}
            />

            <button className="primary-button" disabled={submissionLoading} onClick={handleSubmit} type="button">
              {submissionLoading ? "Submitting..." : "Submit Code"}
            </button>

            {workspaceError ? <p className="error-text">{workspaceError}</p> : null}
          </div>
        ) : (
          <div className="empty-state">Choose an assignment to load the problem statement.</div>
        )}
      </article>

      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Judge Result</p>
            <h2>{submission ? submission.status : "No submission yet"}</h2>
          </div>
        </div>

        {submission ? (
          <div className="result-stack">
            <div className="meta-row">
              <span>ID: {submission.id}</span>
              <span>Language: {submission.language}</span>
            </div>

            <div className="result-summary">
              <strong>Score</strong>
              <span>{submission.score ?? "--"}</span>
            </div>

            {submission.result?.errorMessage ? (
              <p className="error-text">{submission.result.errorMessage}</p>
            ) : null}

            <div className="case-list">
              {submission.result?.cases.map((testCase) => (
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
        ) : (
          <div className="empty-state">
            Submit something first. Use the scenario buttons to simulate different judge outcomes.
          </div>
        )}
      </article>
    </section>
  );
}
