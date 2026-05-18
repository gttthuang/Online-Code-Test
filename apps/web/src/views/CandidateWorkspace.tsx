import { useEffect, useState } from "react";
import type { AssignmentSummary, AuthUser, ProblemDetail, SubmissionDetail, SupportedLanguage } from "@oct/contracts";

import { createSubmission, getAssignments, getProblem, getSubmission, getAdminProblem, createPreviewSubmission, getPreviewSubmission } from "../lib/api";
import "./candidate.css";

// 引入 Monaco Editor
import Editor from "@monaco-editor/react";

const scenarioTemplates = [
  { label: "Accepted", code: "print(42)" },
  { label: "Wrong Answer", code: "wrong_answer" },
  { label: "Compile Error", code: "compile_error" },
  { label: "Runtime Error", code: "runtime_error" }
];

interface CandidateWorkspaceProps {
  token: string;
  user: AuthUser;
  initialProblemId?: string | null;
  onClose?: () => void;
}

export function CandidateWorkspace({ token, user, initialProblemId, onClose }: CandidateWorkspaceProps) {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(initialProblemId ?? null);
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [problemLoading, setProblemLoading] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [sourceCode, setSourceCode] = useState("print(42)");
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);

  const [leftTab, setLeftTab] = useState<"description" | "submissions">("description");
  const [rightTab, setRightTab] = useState<"testcases" | "output">("testcases");

  // UI 控制狀態
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(40);
  const [topHeight, setTopHeight] = useState(60);

  // 輔助函式：將你的語言格式轉換為 Monaco 支援的格式 (例如 C++ 對應 cpp)
  const getMonacoLanguage = (lang: string) => {
    const l = lang.toLowerCase();
    if (l === "c++") return "cpp";
    return l;
  };

  useEffect(() => {
    let cancelled = false;

    if (initialProblemId) {
      setSelectedProblemId(initialProblemId);
      setAssignments([]);
      setAssignmentsLoading(false);
      return;
    }

    setAssignmentsLoading(true);

    getAssignments(token)
      .then((items) => {
        if (cancelled) return;
        setAssignments(items);
        if (initialProblemId) {
          setSelectedProblemId(initialProblemId);
        } else {
          setSelectedProblemId(items[0]?.problemId ?? null);
        }
      })
      .catch((error) => {
        if (!cancelled)
          setWorkspaceError(error instanceof Error ? error.message : "Failed to load assignments");
      })
      .finally(() => {
        if (!cancelled) setAssignmentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, initialProblemId]);

  useEffect(() => {
    if (!selectedProblemId) {
      setProblem(null);
      return;
    }

    let cancelled = false;

    setProblemLoading(true);

    const api =
      user.role === "problem_admin" ? getAdminProblem : getProblem;

    api(token, selectedProblemId)
      .then((nextProblem: ProblemDetail) => {
        if (cancelled) return;
        setProblem(nextProblem);
      })
      .catch((error) => {
        if (!cancelled)
          setWorkspaceError(
            error instanceof Error ? error.message : "Failed to load problem"
          );
      })
      .finally(() => {
        if (!cancelled) setProblemLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProblemId, token, user.role]);

  useEffect(() => {
    if (!submission || !["queued", "running"].includes(submission.status)) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const api = user.role === "problem_admin" ? getPreviewSubmission : getSubmission;
        const nextSubmission = await api(token, submission.id);

        if (cancelled) return;
        setSubmission(nextSubmission);
        if (["queued", "running"].includes(nextSubmission.status)) {
          timer = window.setTimeout(poll, 1000);
        }
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "Failed to poll submission");
      }
    };
    timer = window.setTimeout(poll, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [submission, token]);

  async function handleSubmit() {
    if (!problem) return;
    setSubmissionLoading(true);
    setWorkspaceError(null);
    setRightTab("output");
    try {
      const api = user.role === "problem_admin" ? createPreviewSubmission : createSubmission;

      const created = await api(token, {
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

  const handleColDividerDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = startWidth + (deltaX / window.innerWidth) * 100;
      setLeftWidth(Math.max(20, Math.min(newWidth, 80)));
    };

    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const handleRowDividerDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = topHeight;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = startHeight + (deltaY / window.innerHeight) * 100;
      setTopHeight(Math.max(20, Math.min(newHeight, 80)));
    };

    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div className="fullscreen-wrapper">

      {/* 固定在左側邊緣的開啟按鈕 (未開啟抽屜時顯示) */}
      {!isSelectorOpen && (
        <button
          className="drawer-toggle-btn"
          onClick={() => setIsSelectorOpen(true)}
          title="Show Assignments"
        >
          &gt;
        </button>
      )}

      {/* 側邊抽屜 Overlay */}
      {isSelectorOpen && (
        <div className="drawer-overlay" onClick={() => setIsSelectorOpen(false)} />
      )}

      {/* 側邊抽屜：題目選擇器 */}
      <div className={`problem-drawer ${isSelectorOpen ? "open" : ""}`}>
        <div className="panel-header" style={{ marginBottom: '1rem' }}>
          <h2>Assignments</h2>
          <button className="chip-button" onClick={() => setIsSelectorOpen(false)} title="Close">
            ✕
          </button>
        </div>

        <div className="problem-stack assignment-list">
          {assignmentsLoading ? (
            <p className="empty-state">Loading assignments...</p>
          ) : assignments.length === 0 ? (
            <div className="empty-state">No assignments yet.</div>
          ) : (
            assignments.map((assignment) => (
              <button
                key={assignment.id}
                className={`assignment-item ${selectedProblemId === assignment.problemId ? "assignment-item-active" : ""}`}
                onClick={() => {
                  setSelectedProblemId(assignment.problemId);
                  setIsSelectorOpen(false);
                }}
                type="button"
              >
                <strong>{assignment.problemTitle}</strong>
                <span>{assignment.difficulty}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 主要雙欄工作區 */}
      <section className="workspace-container">

        {/* ================= 左欄：題目敘述與紀錄 ================= */}
        <div className="panel-flex-content" style={{ flex: leftWidth, minWidth: "300px" }}>
          <article className="status-card panel-column" style={{ height: '100%' }}>
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h2>{problemLoading ? "Loading..." : problem?.title ?? "Select an assignment"}</h2>
              </div>

              <div className="scenario-row">
                <button
                  className="chip-button"
                  onClick={() => setLeftTab("description")}
                  style={{ fontWeight: leftTab === "description" ? "bold" : "normal" }}
                >
                  Description
                </button>
                <button
                  className="chip-button"
                  onClick={() => setLeftTab("submissions")}
                  style={{ fontWeight: leftTab === "submissions" ? "bold" : "normal" }}
                >
                  Submissions
                </button>
              </div>
            </div>

            <div className="problem-stack">
              {leftTab === "description" ? (
                problem ? (
                  <>
                    <div className="meta-row">
                      <span>Difficulty: {problem.difficulty}</span>
                      <span>Time: {problem.timeLimitMs} ms</span>
                      <span>Memory: {problem.memoryLimitKb} KB</span>
                    </div>

                    <p className="panel-copy">{problem.description}</p>

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
                  </>
                ) : (
                  <div className="empty-state">
                    {initialProblemId ? "Loading problem..." : "Open the assignments menu on the left to select a problem."}
                  </div>
                )
              ) : (
                submission ? (
                  <div className="result-stack">
                    <div className="result-summary">
                      <strong>Latest Status</strong>
                      <span>{submission.status}</span>
                    </div>
                    <div className="meta-row">
                      <span>Language: {submission.language}</span>
                      <span>Score: {submission.score ?? "--"}</span>
                      <span>Submitted: {new Date(submission.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">No submissions yet.</div>
                )
              )}
            </div>
          </article>
        </div>

        {/* ================= 左右欄拖曳調整列 ================= */}
        <div className="resizer-x" onPointerDown={handleColDividerDrag} title="Drag to resize columns" />

        {/* ================= 右欄：上下分割 ================= */}
        <div className="panel-flex-content" style={{ flex: 100 - leftWidth, minWidth: "300px" }}>

          {/* 右欄上半部：Editor (加入 minHeight: "300px") */}
          <div className="panel-flex-content" style={{ flex: topHeight, minHeight: "300px" }}>
            <article className="status-card panel-column" style={{ height: '100%' }}>
              <div className="panel-header">
                <h2>Code Editor</h2>
                <div className="editor-toolbar">
                  <label className="field field-inline" style={{ flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ whiteSpace: "nowrap" }}>Language:</span>
                    <select
                      value={language}
                      onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
                      style={{ width: "auto", minWidth: "120px" }}
                    >
                      {problem?.supportedLanguages.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="problem-stack" style={{ display: "flex", flexDirection: "column" }}>

                {/* 將原來的 textarea 替換成 Monaco Editor */}
                <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--line)", borderRadius: "16px", overflow: "hidden", padding: "8px 0" }}>
                  <Editor
                    height="100%"
                    language={getMonacoLanguage(language)}
                    value={sourceCode}
                    theme="light" // 若喜歡深色主題可改為 "vs-dark"
                    onChange={(value) => setSourceCode(value || "")}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8 }
                    }}
                  />
                </div>

                {workspaceError ? <p className="error-text">{workspaceError}</p> : null}

                <button className="primary-button" style={{ marginTop: "0rem" }} disabled={submissionLoading} onClick={handleSubmit} type="button">
                  {submissionLoading ? "Submitting..." : "Run & Submit Code"}
                </button>
              </div>
            </article>
          </div>

          {/* 右欄上下拖曳調整列 */}
          <div className="resizer-y" onPointerDown={handleRowDividerDrag} title="Drag to resize height" />

          {/* 右欄下半部：Testcases & Output (加入 minHeight: "170px") */}
          <div className="panel-flex-content" style={{ flex: 100 - topHeight, minHeight: "170px" }}>
            <article className="status-card panel-column" style={{ height: '100%' }}>
              <div className="panel-header">
                <div>
                  <div className="scenario-row">
                    <button
                      className="chip-button"
                      onClick={() => setRightTab("testcases")}
                      style={{ fontWeight: rightTab === "testcases" ? "bold" : "normal" }}
                    >
                      Testcases
                    </button>
                    <button
                      className="chip-button"
                      onClick={() => setRightTab("output")}
                      style={{ fontWeight: rightTab === "output" ? "bold" : "normal" }}
                    >
                      Output
                    </button>
                  </div>
                  <h2>{rightTab === "output" && submission ? submission.status : "Console"}</h2>
                </div>
              </div>

              {rightTab === "testcases" ? (
                <div className="problem-stack">
                  <p className="panel-copy">Hidden testcases will be evaluated upon submission.</p>
                </div>
              ) : (
                submission ? (
                  <div className="result-stack">
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
                    Submit code to see judge output.
                  </div>
                )
              )}
            </article>
          </div>

        </div>
      </section>
    </div>
  );
}