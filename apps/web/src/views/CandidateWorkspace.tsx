import { useEffect, useState, useRef } from "react";
import type { AssignmentSummary, AuthUser, CandidateExamSummary, CustomRunDetail, ProblemDetail, SubmissionDetail, SubmissionHistoryItem, SupportedLanguage } from "@oct/contracts";
import Editor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import type { VimAdapterInstance } from "monaco-vim";
import { initVimMode } from "monaco-vim";

import { createCustomRun, createSubmission, getCandidateExam, getProblem, getSubmission, getAdminProblem, createPreviewSubmission, getPreviewSubmission, getMySubmissionHistory, getAdminSubmissionHistory, getCustomRun, startCandidateExam, createAdminCustomRun, getAdminCustomRun } from "../lib/api";
import { SubmissionHistoryPanel } from "./SubmissionHistoryPanel";
import { loadDraft, saveDraft, loadEditorSettings, saveEditorSettings } from "../lib/drafts";
import "./candidate.css";
import "highlight.js/styles/default.min.css";

type LeftTab = "description" | "submissions";
type RightTab = "testcases" | "terminal" | "output";

const DEFAULT_SOURCE = "print(42)";

interface CandidateWorkspaceProps {
  readonly token: string;
  readonly user: AuthUser;
  readonly initialProblemId?: string | null;
}

// --- ExamGateCard ---

interface ExamGateCardProps {
  readonly assignmentsLoading: boolean;
  readonly exam: CandidateExamSummary | null;
  readonly examStarting: boolean;
  readonly workspaceError: string | null;
  readonly onStartExam: () => void;
}

function ExamGateCard({ assignmentsLoading, exam, examStarting, workspaceError, onStartExam }: ExamGateCardProps) {
  let content: JSX.Element;

  if (assignmentsLoading) {
    content = (
      <>
        <p className="eyebrow">Candidate Exam</p>
        <h1>Loading exam...</h1>
      </>
    );
  } else if (!exam || exam.assignmentCount === 0) {
    content = (
      <>
        <p className="eyebrow">Candidate Exam</p>
        <h1>No assignments yet</h1>
        <p className="panel-copy">Your interviewer has not assigned problems to this account.</p>
      </>
    );
  } else if (exam.status === "expired") {
    content = (
      <>
        <p className="eyebrow">Candidate Exam</p>
        <h1>Time limit reached</h1>
        <p className="panel-copy">This exam has expired. Submission and custom runs are locked.</p>
      </>
    );
  } else {
    content = (
      <>
        <p className="eyebrow">Candidate Exam</p>
        <h1>{exam.assignmentCount} assigned problem{exam.assignmentCount === 1 ? "" : "s"}</h1>
        <p className="panel-copy">Time limit: {formatExamDuration(exam.durationMinutes)}</p>
        <button className="primary-button" disabled={examStarting} onClick={onStartExam} type="button">
          {examStarting ? "Starting..." : "Start Exam"}
        </button>
      </>
    );
  }

  return (
    <div className="fullscreen-wrapper">
      <section className="workspace-container dashboard-page exam-gate-page">
        <article className="status-card exam-start-card">
          {content}
          {workspaceError ? <p className="error-text">{workspaceError}</p> : null}
        </article>
      </section>
    </div>
  );
}

// --- SettingsModal ---

interface SettingsModalProps {
  readonly fontSize: number;
  readonly tabSize: number;
  readonly keybinding: string;
  readonly onFontSizeChange: (value: number) => void;
  readonly onTabSizeChange: (value: number) => void;
  readonly onKeybindingChange: (value: string) => void;
  readonly onClose: () => void;
}

function SettingsModal({ fontSize, tabSize, keybinding, onFontSizeChange, onTabSizeChange, onKeybindingChange, onClose }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();

    // Close on backdrop click (target is the dialog itself, not its inner content).
    // Attached imperatively rather than via an onClick prop so the native <dialog>
    // keeps its built-in keyboard (Escape) handling and stays accessible.
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) onCloseRef.current();
    };

    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("click", handleBackdropClick);
      dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="settings-modal-dialog"
      // Use onCancel (Escape key) rather than onClose: the cleanup below calls
      // dialog.close(), which fires a native "close" event. Under React
      // StrictMode the mount effect runs setup→cleanup→setup, so an onClose
      // handler would flip isSettingsOpen back to false during that cleanup and
      // the modal would close itself the instant it opened.
      onCancel={onClose}
    >
      <div className="settings-modal">
        <h3>Editor Settings</h3>

        <label className="field">
          <span>Font Size (px)</span>
          <select value={fontSize} onChange={(e) => onFontSizeChange(Number(e.target.value))}>
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
          <select value={tabSize} onChange={(e) => onTabSizeChange(Number(e.target.value))}>
            <option value={2}>2 Spaces</option>
            <option value={4}>4 Spaces</option>
            <option value={8}>8 Spaces</option>
          </select>
        </label>

        <label className="field">
          <span>Key Binding</span>
          <select value={keybinding} onChange={(e) => onKeybindingChange(e.target.value)}>
            <option value="standard">Standard</option>
            <option value="vim">Vim</option>
          </select>
        </label>

        <div className="settings-modal-actions">
          <button className="primary-button" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}

// --- AssignmentDrawer ---

interface AssignmentDrawerProps {
  readonly isOpen: boolean;
  readonly assignments: AssignmentSummary[];
  readonly assignmentsLoading: boolean;
  readonly selectedProblemId: string | null;
  readonly remainingSeconds: number | null;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onSelectProblem: (problemId: string) => void;
}

function AssignmentDrawer({ isOpen, assignments, assignmentsLoading, selectedProblemId, remainingSeconds, onOpen, onClose, onSelectProblem }: AssignmentDrawerProps) {
  let assignmentList: JSX.Element;
  if (assignmentsLoading) {
    assignmentList = <p className="empty-state">Loading assignments...</p>;
  } else if (assignments.length === 0) {
    assignmentList = <div className="empty-state">No assignments yet.</div>;
  } else {
    assignmentList = (
      <>
        {assignments.map((assignment) => (
          <button
            key={assignment.id}
            className={`assignment-item ${selectedProblemId === assignment.problemId ? "assignment-item-active" : ""}`}
            onClick={() => onSelectProblem(assignment.problemId)}
            type="button"
          >
            <strong>{assignment.problemTitle}</strong>
            <span>{assignment.difficulty}</span>
          </button>
        ))}
      </>
    );
  }

  return (
    <>
      {!isOpen && (
        <button className="drawer-toggle-btn" onClick={onOpen} title="Show Assignments" type="button">
          &gt;
        </button>
      )}

      {isOpen && (
        <button
          type="button"
          className="drawer-overlay"
          onClick={onClose}
          aria-label="Close assignments drawer"
        />
      )}

      <div className={`problem-drawer ${isOpen ? "open" : ""}`}>
        <div className="panel-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h2>Assignments</h2>
            <p className="label-text">Remaining: {formatRemainingTime(remainingSeconds)}</p>
          </div>
          <button className="chip-button" onClick={onClose} title="Close" type="button">
            ✕
          </button>
        </div>

        <div className="problem-stack assignment-list">
          {assignmentList}
        </div>
      </div>
    </>
  );
}

// --- CandidateWorkspace ---

export function CandidateWorkspace({ token, user, initialProblemId }: CandidateWorkspaceProps) {
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
  const [sourceCode, setSourceCode] = useState(DEFAULT_SOURCE);
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submissionLoading, setSubmissionLoading] = useState(false);

  const [leftTab, setLeftTab] = useState<LeftTab>("description");
  const [rightTab, setRightTab] = useState<RightTab>("testcases");
  const [customInput, setCustomInput] = useState("");
  const [customRun, setCustomRun] = useState<CustomRunDetail | null>(null);
  const [customRunLoading, setCustomRunLoading] = useState(false);

  // UI control state
  const [leftWidth, setLeftWidth] = useState(40);
  const [topHeight, setTopHeight] = useState(60);

  // === Editor preference settings state ===
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState<number>(14);
  const [tabSize, setTabSize] = useState<number>(4);
  const [keybinding, setKeybinding] = useState<string>("standard");

  const isAdminPreview = user.role === "problem_admin";

  // Restore the user's saved editor preferences once on load.
  useEffect(() => {
    const saved = loadEditorSettings(user.id);
    if (!saved) return;
    setFontSize(saved.fontSize);
    setTabSize(saved.tabSize);
    setKeybinding(saved.keybinding);
  }, [user.id]);

  // Persist editor preferences whenever the user changes one. Saving from the
  // change handlers (rather than an effect on the values) avoids overwriting the
  // stored settings with defaults before the restore effect above has run.
  const handleFontSizeChange = (value: number) => {
    setFontSize(value);
    saveEditorSettings(user.id, { fontSize: value, tabSize, keybinding });
  };

  const handleTabSizeChange = (value: number) => {
    setTabSize(value);
    saveEditorSettings(user.id, { fontSize, tabSize: value, keybinding });
  };

  const handleKeybindingChange = (value: string) => {
    setKeybinding(value);
    saveEditorSettings(user.id, { fontSize, tabSize, keybinding: value });
  };

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const vimModeRef = useRef<VimAdapterInstance | null>(null);

  // Helper: converts language format to Monaco-supported format
  const getMonacoLanguage = (lang: string) => {
    const l = lang.toLowerCase();
    if (l === "c++") return "cpp";
    return l;
  };

  // Apply keybinding logic
  const applyKeybinding = (mode: string) => {
    // Dispose existing Vim mode before switching to avoid memory leaks or duplicate bindings
    if (vimModeRef.current) {
      vimModeRef.current.dispose();
      vimModeRef.current = null;
    }

    if (mode === "vim" && editorRef.current) {
      const statusNode = document.getElementById("vim-status-bar");
      if (statusNode) {
        // Clear previous status text to avoid stale content
        statusNode.innerHTML = "";
        vimModeRef.current = initVimMode(editorRef.current, statusNode);
      }
    }
  };

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    applyKeybinding(keybinding);
  };

  // Re-apply keybinding whenever mode changes
  useEffect(() => {
    applyKeybinding(keybinding);

    // Cleanup on unmount
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
          const initialAssignment = initialProblemId
            ? nextExam.assignments.find((assignment) => assignment.problemId === initialProblemId)
            : null;
          setSelectedProblemId(initialAssignment?.problemId ?? nextExam.assignments[0]?.problemId ?? null);
        } else {
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

    const timer = globalThis.setInterval(() => {
      setRemainingSeconds((current) => current === null ? null : Math.max(0, current - 1));
    }, 1000);

    return () => globalThis.clearInterval(timer);
  }, [exam?.remainingSeconds, exam?.status, user.role]);

  useEffect(() => {
    if (user.role === "candidate" && exam?.status === "started" && remainingSeconds === 0) {
      setExam((current) => current ? { ...current, status: "expired", remainingSeconds: 0, assignments: [] } : current);
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

    const api = user.role === "problem_admin" ? getAdminProblem : getProblem;

    api(token, selectedProblemId)
      .then((nextProblem: ProblemDetail) => {
        if (cancelled) return;
        setProblem(nextProblem);
        setCustomInput(nextProblem.sampleInput);
        setCustomRun(null);
      })
      .catch((error) => {
        if (!cancelled)
          setWorkspaceError(error instanceof Error ? error.message : "Failed to load problem");
      })
      .finally(() => {
        if (!cancelled) setProblemLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProblemId, token, user.role]);

  // Restore the candidate's locally saved draft when the active problem or
  // language changes, falling back to the default starter code.
  useEffect(() => {
    if (user.role !== "candidate" || !selectedProblemId) return;
    const saved = loadDraft(user.id, selectedProblemId, language);
    setSourceCode(saved ?? DEFAULT_SOURCE);
  }, [selectedProblemId, language, user.id, user.role]);

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
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const api = user.role === "problem_admin" ? getPreviewSubmission : getSubmission;
        const nextSubmission = await api(token, submission.id);

        if (cancelled) return;
        setSubmission(nextSubmission);
        if (["queued", "running"].includes(nextSubmission.status)) {
          timer = globalThis.setTimeout(poll, 1000);
        }
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "Failed to poll submission");
      }
    };
    timer = globalThis.setTimeout(poll, 600);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [submission, token, user.role]);

  useEffect(() => {
    if (!customRun || !["queued", "running"].includes(customRun.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    
    const poll = async () => {
      try {
        const api = user.role === "problem_admin" ? getAdminCustomRun : getCustomRun;
        const nextRun = await api(token, customRun.id);

        if (cancelled) return;
        setCustomRun(nextRun);
        if (["queued", "running"].includes(nextRun.status)) {
          timer = globalThis.setTimeout(poll, 800);
        }
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "Failed to poll custom run");
      }
    };

    timer = globalThis.setTimeout(poll, 500);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [customRun?.id, customRun?.status, token, user.role]);

  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (contentRef.current) {
        const blocks = contentRef.current.querySelectorAll('pre');
        blocks.forEach((block) => {
          hljs.highlightElement(block);
        });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [problem]);

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
    if (!problem || (user.role !== "candidate" && user.role !== "problem_admin")) return;

    setCustomRunLoading(true);
    setWorkspaceError(null);
    setRightTab("terminal");

    try {
      let created;

      if (user.role === "problem_admin") {
        created = await createAdminCustomRun(token, {
          problemId: problem.id,
          language,
          sourceCode,
          stdin: customInput,
          candidateId: user.id
        });
      } else {
        created = await createCustomRun(token, {
          problemId: problem.id,
          language,
          sourceCode,
          stdin: customInput
        });
      }

      if (!created?.runId) {
        throw new Error("Custom run did not return an id");
      }

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
      <ExamGateCard
        assignmentsLoading={assignmentsLoading}
        exam={exam}
        examStarting={examStarting}
        workspaceError={workspaceError}
        onStartExam={handleStartExam}
      />
    );
  }

  const consoleTitle = getConsoleTitle(rightTab, submission, customRun);

  const leftPanelContent = (
    <LeftPanel
      historyLoading={historyLoading}
      initialProblemId={initialProblemId}
      isAdminPreview={isAdminPreview}
      leftTab={leftTab}
      onSelectHistoryItem={handleSelectHistoryItem}
      problem={problem}
      selectedSubmissionId={submission?.id ?? null}
      submissionHistory={submissionHistory}
      
    />
  );

  const rightTabContent = (
    <RightTabContent
      customInput={customInput}
      customRun={customRun}
      customRunLoading={customRunLoading}
      hasProblem={Boolean(problem)}
      onCustomInputChange={setCustomInput}
      onCustomRun={handleCustomRun}
      rightTab={rightTab}
      role={user.role}
      submission={submission}
    />
  );

  return (
    <div className="fullscreen-wrapper">

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          fontSize={fontSize}
          keybinding={keybinding}
          tabSize={tabSize}
          onClose={() => setIsSettingsOpen(false)}
          onFontSizeChange={handleFontSizeChange}
          onKeybindingChange={handleKeybindingChange}
          onTabSizeChange={handleTabSizeChange}
        />
      )}

      {/* Main two-column workspace */}
      <section className="workspace-container">

        {/* ================= Left column: problem description and history ================= */}
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

            <div className="problem-stack" ref={contentRef}>
              {leftPanelContent}
            </div>
          </article>
        </div>

        {/* ================= Left-right column drag resizer ================= */}
        <div className="resizer-x" onPointerDown={handleColDividerDrag} title="Drag to resize columns" />

        {/* ================= Right column: top-bottom split ================= */}
        <div className="panel-flex-content" style={{ flex: 100 - leftWidth, minWidth: "300px" }}>

          {/* Right column upper half: Editor */}
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

                {/* Monaco Editor and Vim status bar container */}
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, border: "1px solid var(--line)", borderRadius: "16px", overflow: "hidden" }}>
                  {/* The editor takes the remaining space (flex: 1) rather than a fixed
                      100% height, so the vim status bar below can claim its own height
                      without overflowing and pushing the editor. automaticLayout lets
                      Monaco re-measure when the bar toggles or the panel is resized. */}
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <Editor
                      height="100%"
                      language={getMonacoLanguage(language)}
                      value={sourceCode}
                      theme="light"
                      onChange={(value = "") => {
                        setSourceCode(value);
                        // Persist on edit so the draft survives closing/refreshing the tab.
                        if (user.role === "candidate" && selectedProblemId) {
                          saveDraft(user.id, selectedProblemId, language, value);
                        }
                      }}
                      onMount={handleEditorMount}
                      options={{
                        minimap: { enabled: false },
                        fontSize: fontSize,
                        tabSize: tabSize,
                        detectIndentation: false, // disable auto-detection, force custom tabSize
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        automaticLayout: true,
                        padding: { top: 8 }
                      }}
                    />
                  </div>
                  {/* Vim-specific status bar */}
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

          {/* Right column top-bottom drag resizer */}
          <div className="resizer-y" onPointerDown={handleRowDividerDrag} title="Drag to resize height" />

          {/* Right column lower half: Testcases & Output */}
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
                  <h2>{consoleTitle}</h2>
                </div>
              </div>

              {rightTabContent}
            </article>
          </div>

        </div>
      </section>
    </div>
  );
}

function getConsoleTitle(
  rightTab: RightTab,
  submission: SubmissionDetail | null,
  customRun: CustomRunDetail | null
) {
  if (rightTab === "output" && submission) {
    return submission.status;
  }
  if (rightTab === "terminal" && customRun) {
    return customRun.status;
  }
  return "Console";
}

interface LeftPanelProps {
  readonly leftTab: LeftTab;
  readonly problem: ProblemDetail | null;
  readonly initialProblemId?: string | null;
  readonly isAdminPreview: boolean;
  readonly historyLoading: boolean;
  readonly submissionHistory: SubmissionHistoryItem[];
  readonly selectedSubmissionId: string | null;
  readonly onSelectHistoryItem: (item: SubmissionHistoryItem) => void;
}

function LeftPanel({
  leftTab,
  problem,
  initialProblemId,
  isAdminPreview,
  historyLoading,
  submissionHistory,
  selectedSubmissionId,
  onSelectHistoryItem
}: LeftPanelProps) {
  if (leftTab !== "description") {
    return (
      <SubmissionHistoryPanel
        emptyMessage={isAdminPreview ? "No preview submissions yet." : "No submissions yet."}
        loading={historyLoading}
        onSelect={onSelectHistoryItem}
        selectedId={selectedSubmissionId}
        submissions={submissionHistory}
      />
    );
  }

  if (!problem) {
    return (
      <div className="empty-state">
        {initialProblemId ? "Loading problem..." : "Open the assignments menu on the left to select a problem."}
      </div>
    );
  }

  return (
    <>
      <div className="meta-row">
        <span>Difficulty: {problem.difficulty}</span>
        <span>Time: {problem.timeLimitMs} ms</span>
        <span>Memory: {problem.memoryLimitKb} KB</span>
      </div>

      {problem.description && (
        <div 
          className="ql-editor"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(problem.description) }}
        />
      )}

      {problem.inputSpec?.trim() ? (
        <div className="problem-extended-section">
          <p className="label-text make-label-bold-black">Input Specification:</p>
          <p className="panel-copy problem-extended-content">
            {problem.inputSpec}
          </p>
        </div>
      ) : null}

      {problem.outputSpec?.trim() ? (
        <div className="problem-extended-section">
          <p className="label-text make-label-bold-black">Output Specification:</p>
          <p className="panel-copy problem-extended-content">
            {problem.outputSpec}
          </p>
        </div>
      ) : null}

      <div className="sample-grid" style={{ marginTop: "15px", marginBottom: "0px" }}>
        <div>
          <p className="label-text make-label-bold-black">Sample Input</p>
          <pre>{problem.sampleInput}</pre>
        </div>
        <div>
          <p className="label-text make-label-bold-black">Sample Output</p>
          <pre>{problem.sampleOutput}</pre>
        </div>
      </div>

      {problem.sampleExplanation?.trim() ? (
        <div className="sample-grid" style={{ marginTop: "4px", marginBottom: "30px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <p className="label-text make-label-bold-black">Sample Explanation:</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>{problem.sampleExplanation}</pre>
          </div>
        </div>
      ) : null}

      {problem.constraints?.trim() ? (
        <div className="problem-extended-section">
          <p className="label-text make-label-bold-black">Constraints:</p>
          <p className="panel-copy problem-extended-content">
            {problem.constraints}
          </p>
        </div>
      ) : null}
    </>
  );
}

function SubmissionOutput({ submission }: { readonly submission: SubmissionDetail | null }) {
  if (!submission) {
    return <div className="empty-state">Submit code to see judge output.</div>;
  }

  return (
    <div className="result-stack">
      {submission.result?.errorMessage ? <p className="error-text">{submission.result.errorMessage}</p> : null}
      <div className="case-list">
        {submission.result?.cases.map((testCase) => (
          <div className="case-item" key={testCase.testCaseId}>
            <div>
              <strong>{testCase.testCaseId}</strong>
              <small>
                {testCase.executionTimeMs} ms / {testCase.memoryKb} KB
              </small>
            </div>
            <span className={testCase.passed ? "case-pass" : "case-fail"}>{testCase.passed ? "PASS" : "FAIL"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TerminalOutput({ customRun }: { readonly customRun: CustomRunDetail | null }) {
  if (!customRun) {
    return <div className="empty-state">Run custom input to see stdout and stderr.</div>;
  }

  const stdoutFallback = ["queued", "running"].includes(customRun.status) ? "Running..." : "";

  return (
    <div className="terminal-output-grid">
      {customRun.errorMessage ? <p className="error-text">{customRun.errorMessage}</p> : null}
      <div>
        <p className="label-text">stdout</p>
        <pre className="terminal-pre">{customRun.stdout ?? stdoutFallback}</pre>
      </div>
      <div>
        <p className="label-text">stderr</p>
        <pre className="terminal-pre">{customRun.stderr ?? ""}</pre>
      </div>
      {customRun.executionTimeMs === null ? null : <small>{customRun.executionTimeMs} ms</small>}
    </div>
  );
}

interface RightTabContentProps {
  readonly rightTab: RightTab;
  readonly submission: SubmissionDetail | null;
  readonly customRun: CustomRunDetail | null;
  readonly hasProblem: boolean;
  readonly customInput: string;
  readonly customRunLoading: boolean;
  readonly role: AuthUser["role"];
  readonly onCustomInputChange: (value: string) => void;
  readonly onCustomRun: () => void;
}

function RightTabContent({
  rightTab,
  submission,
  customRun,
  hasProblem,
  customInput,
  customRunLoading,
  role,
  onCustomInputChange,
  onCustomRun
}: RightTabContentProps) {
  if (rightTab === "testcases") {
    return (
      <div className="problem-stack">
        <p className="panel-copy">Hidden testcases will be evaluated upon submission.</p>
      </div>
    );
  }

  if (rightTab === "terminal") {
    return (
      <div className="problem-stack">
        <label className="field">
          <span>Standard Input</span>
          <textarea
            disabled={role !== "candidate"}
            onChange={(event) => onCustomInputChange(event.target.value)}
            placeholder="Input passed to stdin"
            rows={5}
            value={customInput}
          />
        </label>

        <button
          className="secondary-button"
          disabled={customRunLoading || !hasProblem || (role !== "candidate" && role !== "problem_admin")}
          onClick={onCustomRun}
          title={role === "candidate" ? "Run current code with custom stdin" : "Custom runs are available to candidates."}
          type="button"
        >
          {customRunLoading ? "Starting..." : "Run Custom Input"}
        </button>

        <TerminalOutput customRun={customRun} />
      </div>
    );
  }

  return <SubmissionOutput submission={submission} />;
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
