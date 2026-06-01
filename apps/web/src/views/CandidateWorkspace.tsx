import { useEffect, useState, useRef } from "react";
import type { AssignmentSummary, AuthUser, CandidateExamSummary, CustomRunDetail, ProblemDetail, SubmissionDetail, SubmissionHistoryItem, SupportedLanguage } from "@oct/contracts";

import { createCustomRun, createSubmission, getCandidateExam, getProblem, getSubmission, getAdminProblem, createPreviewSubmission, getPreviewSubmission, getMySubmissionHistory, getAdminSubmissionHistory, getCustomRun, startCandidateExam } from "../lib/api";
import { SubmissionHistoryPanel } from "./SubmissionHistoryPanel";
import "./candidate.css";

// 引入 Monaco Editor 與 Vim 模式
import Editor from "@monaco-editor/react";
import { initVimMode } from "monaco-vim";

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
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(
    user.role === "problem_admin" ? initialProblemId ?? null : null
  );
  const [exam, setExam] = useState<CandidateExamSummary | null>(null);
  const [examStarting, setExamStarting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [problemLoading, setProblemLoading] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(user.role === "candidate");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [sourceCode, setSourceCode] = useState("print(42)");
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submissionLoading, setSubmissionLoading] = useState(false);

  const [leftTab, setLeftTab] = useState<"description" | "submissions">("description");
  const [rightTab, setRightTab] = useState<"testcases" | "terminal" | "output">("testcases");
  const [customInput, setCustomInput] = useState("");
  const [customRun, setCustomRun] = useState<CustomRunDetail | null>(null);
  const [customRunLoading, setCustomRunLoading] = useState(false);

  // UI 控制狀態
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(40);
  const [topHeight, setTopHeight] = useState(60);

  // === 編輯器偏好設定狀態 ===
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState<number>(14);
  const [tabSize, setTabSize] = useState<number>(4);
  const [keybinding, setKeybinding] = useState<string>("standard");
  const isAdminPreview = user.role === "problem_admin";
  const showAssignmentDrawer = user.role === "candidate" && !initialProblemId && exam?.status === "started";

  // === 編輯器與 Vim 實體參考 ===
  const editorRef = useRef<any>(null);
  const vimModeRef = useRef<any>(null);

  // 輔助函式：將你的語言格式轉換為 Monaco 支援的格式
  const getMonacoLanguage = (lang: string) => {
    const l = lang.toLowerCase();
    if (l === "c++") return "cpp";
    return l;
  };

  // 當 Monaco 編輯器掛載完成時觸發
  const handleEditorMount = (editor: any) => {
    editorRef.current = editor;
    applyKeybinding(keybinding); // 初始化時套用按鍵綁定設定
  };

  // 套用按鍵綁定邏輯
  const applyKeybinding = (mode: string) => {
    // 每次切換前，先卸載既有的 Vim 模式以避免記憶體流失或重複綁定
    if (vimModeRef.current) {
      vimModeRef.current.dispose();
      vimModeRef.current = null;
    }

    if (mode === "vim" && editorRef.current) {
      const statusNode = document.getElementById("vim-status-bar");
      if (statusNode) {
        // 清空先前的狀態文字 (避免殘留)
        statusNode.innerHTML = "";
        vimModeRef.current = initVimMode(editorRef.current, statusNode);
      }
    }
  };

  // 監聽 keybinding 狀態變化，動態切換模式
  useEffect(() => {
    applyKeybinding(keybinding);

    // 元件卸載時的清理工作
    return () => {
      if (vimModeRef.current) {
        vimModeRef.current.dispose();
      }
    };
  }, [keybinding]);

  useEffect(() => {
    let cancelled = false;

    if (user.role === "problem_admin") {
      setSelectedProblemId(initialProblemId ?? null);
      setAssignments([]);
      setAssignmentsLoading(false);
      return;
    }

    setAssignmentsLoading(true);

    setWorkspaceError(null);

    getCandidateExam(token)
      .then((nextExam) => {
        if (cancelled) return;
        setExam(nextExam);
        setRemainingSeconds(nextExam.remainingSeconds);

        if (nextExam.status === "started") {
          setAssignments(nextExam.assignments);
          const initialAssignment = initialProblemId
            ? nextExam.assignments.find((assignment) => assignment.problemId === initialProblemId)
            : null;
          setSelectedProblemId(initialAssignment?.problemId ?? nextExam.assignments[0]?.problemId ?? null);
        } else {
          setAssignments([]);
          setSelectedProblemId(null);
          setProblem(null);
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
  }, [token, initialProblemId, user.role]);

  useEffect(() => {
    setRemainingSeconds(exam?.remainingSeconds ?? null);

    if (user.role !== "candidate" || exam?.status !== "started") {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => current === null ? null : Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [exam?.remainingSeconds, exam?.status, user.role]);

  useEffect(() => {
    if (user.role === "candidate" && exam?.status === "started" && remainingSeconds === 0) {
      setExam((current) => current ? { ...current, status: "expired", remainingSeconds: 0, assignments: [] } : current);
      setAssignments([]);
      setSelectedProblemId(null);
      setProblem(null);
    }
  }, [exam?.status, remainingSeconds, user.role]);

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
        setCustomInput(nextProblem.sampleInput);
        setCustomRun(null);
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
    if (!selectedProblemId) {
      setSubmissionHistory([]);
      return;
    }

    let cancelled = false;
    const api = user.role === "problem_admin" ? getAdminSubmissionHistory : getMySubmissionHistory;

    setHistoryLoading(true);
    api(token)
      .then((items) => {
        if (cancelled) return;
        setSubmissionHistory(items.filter((item) => item.problemId === selectedProblemId));
      })
      .catch((error) => {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "Failed to load submission history");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProblemId, submission?.id, submission?.status, token, user.role]);

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
  }, [submission, token, user.role]);

  useEffect(() => {
    if (!customRun || !["queued", "running"].includes(customRun.status)) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const nextRun = await getCustomRun(token, customRun.id);

        if (cancelled) return;
        setCustomRun(nextRun);
        if (["queued", "running"].includes(nextRun.status)) {
          timer = window.setTimeout(poll, 800);
        }
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "Failed to poll custom run");
      }
    };
    timer = window.setTimeout(poll, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customRun?.id, customRun?.status, token]);

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

  async function handleCustomRun() {
    if (!problem || user.role !== "candidate") return;

    setCustomRunLoading(true);
    setWorkspaceError(null);
    setRightTab("terminal");

    try {
      const created = await createCustomRun(token, {
        problemId: problem.id,
        language,
        sourceCode,
        stdin: customInput
      });
      const now = new Date().toISOString();

      setCustomRun({
        id: created.runId,
        candidateId: user.id,
        problemId: problem.id,
        requestedBy: user.id,
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
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Failed to run custom input");
    } finally {
      setCustomRunLoading(false);
    }
  }

  function handleSelectHistoryItem(item: SubmissionHistoryItem) {
    setSubmission(item);
    setRightTab("output");
  }

  async function handleStartExam() {
    setExamStarting(true);
    setWorkspaceError(null);

    try {
      const response = await startCandidateExam(token);
      setExam(response.exam);
      setRemainingSeconds(response.exam.remainingSeconds);

      if (response.exam.status === "started") {
        setAssignments(response.exam.assignments);
        const initialAssignment = initialProblemId
          ? response.exam.assignments.find((assignment) => assignment.problemId === initialProblemId)
          : null;
        setSelectedProblemId(initialAssignment?.problemId ?? response.exam.assignments[0]?.problemId ?? null);
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Failed to start exam");
    } finally {
      setExamStarting(false);
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

  if (user.role === "candidate" && exam?.status !== "started") {
    return (
      <div className="fullscreen-wrapper">
        <section className="workspace-container dashboard-page exam-gate-page">
          <article className="status-card exam-start-card">
            {assignmentsLoading ? (
              <>
                <p className="eyebrow">Candidate Exam</p>
                <h1>Loading exam...</h1>
              </>
            ) : !exam || exam.assignmentCount === 0 ? (
              <>
                <p className="eyebrow">Candidate Exam</p>
                <h1>No assignments yet</h1>
                <p className="panel-copy">Your interviewer has not assigned problems to this account.</p>
              </>
            ) : exam.status === "expired" ? (
              <>
                <p className="eyebrow">Candidate Exam</p>
                <h1>Time limit reached</h1>
                <p className="panel-copy">This exam has expired. Submission and custom runs are locked.</p>
              </>
            ) : (
              <>
                <p className="eyebrow">Candidate Exam</p>
                <h1>{exam.assignmentCount} assigned problem{exam.assignmentCount === 1 ? "" : "s"}</h1>
                <p className="panel-copy">Time limit: {formatExamDuration(exam.durationMinutes)}</p>
                <button className="primary-button" disabled={examStarting} onClick={handleStartExam} type="button">
                  {examStarting ? "Starting..." : "Start Exam"}
                </button>
              </>
            )}
            {workspaceError ? <p className="error-text">{workspaceError}</p> : null}
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="fullscreen-wrapper">

      {/* 偏好設定 Modal */}
      {isSettingsOpen && (
        <div className="settings-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editor Settings</h3>

            <label className="field">
              <span>Font Size (px)</span>
              {/* 改為下拉選單 */}
              <select value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}>
                <option value={10}>10</option>
                <option value={12}>12</option>
                <option value={14}>14</option>
                <option value={16}>16</option>
                <option value={18}>18</option>
                <option value={20}>20</option>
              </select>
            </label>

            <label className="field">
              <span>Tab Size</span>
              <select value={tabSize} onChange={(e) => setTabSize(Number(e.target.value))}>
                <option value={2}>2 Spaces</option>
                <option value={4}>4 Spaces</option>
                <option value={8}>8 Spaces</option>
              </select>
            </label>

            <label className="field">
              <span>Key Binding</span>
              <select value={keybinding} onChange={(e) => setKeybinding(e.target.value)}>
                <option value="standard">Standard</option>
                <option value="vim">Vim</option>
              </select>
            </label>

            <div className="settings-modal-actions">
              <button className="primary-button" onClick={() => setIsSettingsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 固定在左側邊緣的開啟按鈕 (未開啟抽屜時顯示) */}
      {showAssignmentDrawer && !isSelectorOpen && (
        <button
          className="drawer-toggle-btn"
          onClick={() => setIsSelectorOpen(true)}
          title="Show Assignments"
        >
          &gt;
        </button>
      )}

      {/* 側邊抽屜 Overlay */}
      {showAssignmentDrawer && isSelectorOpen && (
        <div className="drawer-overlay" onClick={() => setIsSelectorOpen(false)} />
      )}

      {/* 側邊抽屜：題目選擇器 */}
      {showAssignmentDrawer ? (
        <div className={`problem-drawer ${isSelectorOpen ? "open" : ""}`}>
          <div className="panel-header" style={{ marginBottom: '1rem' }}>
            <div>
              <h2>Assignments</h2>
              <p className="label-text">Remaining: {formatRemainingTime(remainingSeconds)}</p>
            </div>
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
      ) : null}

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
                  {isAdminPreview ? "Latest Run" : "Submissions"}
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
                <SubmissionHistoryPanel
                  emptyMessage={isAdminPreview ? "No preview submissions yet." : "No submissions yet."}
                  loading={historyLoading}
                  onSelect={handleSelectHistoryItem}
                  selectedId={submission?.id}
                  submissions={submissionHistory}
                />
              )}
            </div>
          </article>
        </div>

        {/* ================= 左右欄拖曳調整列 ================= */}
        <div className="resizer-x" onPointerDown={handleColDividerDrag} title="Drag to resize columns" />

        {/* ================= 右欄：上下分割 ================= */}
        <div className="panel-flex-content" style={{ flex: 100 - leftWidth, minWidth: "300px" }}>

          {/* 右欄上半部：Editor */}
          <div className="panel-flex-content" style={{ flex: topHeight, minHeight: "300px" }}>
            <article className="status-card panel-column" style={{ height: '100%' }}>
              <div className="panel-header">
                <div>
                  <h2>Code Editor</h2>
                  {user.role === "candidate" ? (
                    <p className="label-text">Remaining: {formatRemainingTime(remainingSeconds)}</p>
                  ) : null}
                </div>
                <div className="editor-toolbar">
                  <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <label className="field field-inline" style={{ flexDirection: "row", alignItems: "center", gap: "0.75rem", margin: 0 }}>
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
                    <button
                      className="chip-button"
                      onClick={() => setIsSettingsOpen(true)}
                      title="Editor Settings"
                    >
                      ⚙️ Settings
                    </button>
                  </div>
                </div>
              </div>

              <div className="problem-stack" style={{ display: "flex", flexDirection: "column" }}>

                {/* Monaco Editor 與 Vim 狀態列外框 */}
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, border: "1px solid var(--line)", borderRadius: "16px", overflow: "hidden" }}>
                  <Editor
                    height="100%"
                    language={getMonacoLanguage(language)}
                    value={sourceCode}
                    theme="light"
                    onChange={(value) => setSourceCode(value || "")}
                    onMount={handleEditorMount}
                    options={{
                      minimap: { enabled: false },
                      fontSize: fontSize,
                      tabSize: tabSize,
                      detectIndentation: false, // 關閉自動偵測，強制使用自訂的 tabSize
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8 }
                    }}
                  />
                  {/* Vim 專用狀態列 */}
                  <div id="vim-status-bar" className="vim-status-bar" />
                </div>

                {workspaceError ? <p className="error-text">{workspaceError}</p> : null}

                <button
                  className="primary-button"
                  disabled={submissionLoading || !problem}
                  onClick={handleSubmit}
                  style={{ marginTop: "0rem" }}
                  title={problem ? "Submit this solution to the judge" : "Select an assignment before submitting"}
                  type="button"
                >
                  {submissionLoading ? "Submitting..." : "Run & Submit Code"}
                </button>
              </div>
            </article>
          </div>

          {/* 右欄上下拖曳調整列 */}
          <div className="resizer-y" onPointerDown={handleRowDividerDrag} title="Drag to resize height" />

          {/* 右欄下半部：Testcases & Output */}
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
                      onClick={() => setRightTab("terminal")}
                      style={{ fontWeight: rightTab === "terminal" ? "bold" : "normal" }}
                    >
                      Terminal
                    </button>
                    <button
                      className="chip-button"
                      onClick={() => setRightTab("output")}
                      style={{ fontWeight: rightTab === "output" ? "bold" : "normal" }}
                    >
                      Output
                    </button>
                  </div>
                  <h2>{rightTab === "output" && submission ? submission.status : rightTab === "terminal" && customRun ? customRun.status : "Console"}</h2>
                </div>
              </div>

              {rightTab === "testcases" ? (
                <div className="problem-stack">
                  <p className="panel-copy">Hidden testcases will be evaluated upon submission.</p>
                </div>
              ) : rightTab === "terminal" ? (
                <div className="problem-stack">
                  <label className="field">
                    <span>Standard Input</span>
                    <textarea
                      disabled={user.role !== "candidate"}
                      onChange={(event) => setCustomInput(event.target.value)}
                      placeholder="Input passed to stdin"
                      rows={5}
                      value={customInput}
                    />
                  </label>

                  <button
                    className="secondary-button"
                    disabled={customRunLoading || !problem || user.role !== "candidate"}
                    onClick={handleCustomRun}
                    title={user.role === "candidate" ? "Run current code with custom stdin" : "Custom runs are available to candidates."}
                    type="button"
                  >
                    {customRunLoading ? "Starting..." : "Run Custom Input"}
                  </button>

                  {customRun ? (
                    <div className="terminal-output-grid">
                      {customRun.errorMessage ? <p className="error-text">{customRun.errorMessage}</p> : null}
                      <div>
                        <p className="label-text">stdout</p>
                        <pre className="terminal-pre">{customRun.stdout ?? (["queued", "running"].includes(customRun.status) ? "Running..." : "")}</pre>
                      </div>
                      <div>
                        <p className="label-text">stderr</p>
                        <pre className="terminal-pre">{customRun.stderr ?? ""}</pre>
                      </div>
                      {customRun.executionTimeMs !== null ? <small>{customRun.executionTimeMs} ms</small> : null}
                    </div>
                  ) : (
                    <div className="empty-state">Run custom input to see stdout and stderr.</div>
                  )}
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

function formatExamDuration(durationMinutes: number | null) {
  if (!durationMinutes) {
    return "Not set";
  }

  return `${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}`;
}

function formatRemainingTime(remainingSeconds: number | null) {
  if (remainingSeconds === null) {
    return "--:--";
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
