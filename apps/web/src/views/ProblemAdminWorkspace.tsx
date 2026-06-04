import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { roles } from "@oct/contracts";
import type { AuthUser, ProblemDifficulty, ProblemLifecycleImpact, ProblemSummary, SubmissionHistoryItem, UserRole } from "@oct/contracts";
import { useLocation, useNavigate } from "react-router-dom";

import { archiveProblem, createProblem, createUser, deleteProblem, deleteUser, getAdminProblems, getAdminSubmissionHistory, getProblemImpact, getUsers } from "../lib/api";
import { CandidateWorkspace } from "../views/CandidateWorkspace";
import { SubmissionHistoryPanel, getSubmissionVerdict, verdictFilterOptions } from "./SubmissionHistoryPanel";
import type { VerdictKind } from "./SubmissionHistoryPanel";

interface ProblemAdminWorkspaceProps {
  currentUserId: string;
  token: string;
}

interface TestCaseState {
  id: string;
  input: File | null;
  output: File | null;
  label?: string;
}

interface ProblemFormState {
  title: string;
  description: string;
  constraints: string; // 新增：限制條件
  inputSpec: string;   // 新增：輸入說明
  outputSpec: string;  // 新增：輸出說明
  difficulty: ProblemDifficulty;
  sampleInput: string;
  sampleOutput: string;
  sampleExplanation: string; // 新增：範例解釋
  timeLimitMs: number;
  memoryLimitKb: number;
}

interface NoticeState {
  type: "error" | "success";
  title: string;
  message: string;
}

const initialFormState: ProblemFormState = {
  title: "FizzBuzz",
  description: "Return the fizz buzz sequence for numbers from 1 to n.",
  difficulty: "easy",
  sampleInput: "5",
  sampleOutput: "1 2 fizz 4 buzz",
  timeLimitMs: 1000,
  memoryLimitKb: 65536,
  constraints: "", // 新增：限制條件
  inputSpec: "",   // 新增：輸入說明
  outputSpec: "",  // 新增：輸出說明
  sampleExplanation: ""
};

const roleLabels = {
  candidate: "Candidate",
  interviewer: "Interviewer",
  problem_admin: "Admin"
} satisfies Record<UserRole, string>;

const hiddenTestcaseMaxCount = 50;

function createTestcaseId() {
  return `testcase_${globalThis.crypto.randomUUID()}`;
}

function createEmptyTestcase(): TestCaseState {
  return {
    id: createTestcaseId(),
    input: null,
    output: null
  };
}

function createImportedTestcase(input: File, output: File, label: string): TestCaseState {
  return {
    id: createTestcaseId(),
    input,
    output,
    label
  };
}

function getTestcaseFileParts(fileName: string) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".in")) {
    return {
      kind: "input" as const,
      stem: fileName.slice(0, -3)
    };
  }

  if (lowerName.endsWith(".out")) {
    return {
      kind: "output" as const,
      stem: fileName.slice(0, -4)
    };
  }

  return null;
}

function resolveActiveSection(pathname: string) {
  if (pathname.includes("/submissions")) {
    return "submissions";
  }
  if (pathname.includes("/users")) {
    return "users";
  }
  if (pathname.includes("/new")) {
    return "new";
  }
  if (pathname.includes("/problems")) {
    return "problems";
  }
  return "dashboard";
}

export function ProblemAdminWorkspace({ currentUserId, token }: ProblemAdminWorkspaceProps) {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [form, setForm] = useState<ProblemFormState>(initialFormState);
  const [testcases, setTestcases] = useState<TestCaseState[]>(() => [createEmptyTestcase()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "description" | "sample" | "testcase">("info");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmImpact, setConfirmImpact] = useState<ProblemLifecycleImpact | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [forceDeleteConfirmed, setForceDeleteConfirmed] = useState(false);
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const previewProblemId = /^\/problem-admin\/problems\/([^/]+)\/preview$/.exec(location.pathname)?.[1] ?? null;
  const activeSection = resolveActiveSection(location.pathname);

  const confirmProblem = problems.find((problem) => problem.id === confirmId);
  const difficultyCounts = useMemo(
    () => ({
      easy: problems.filter((problem) => problem.difficulty === "easy").length,
      medium: problems.filter((problem) => problem.difficulty === "medium").length,
      hard: problems.filter((problem) => problem.difficulty === "hard").length
    }),
    [problems]
  );
  const canAddNewTestCase =
    testcases.length === 0 ||
    Boolean(testcases[testcases.length - 1].input && testcases[testcases.length - 1].output);

  useEffect(() => {
    let cancelled = false;

    getAdminProblems(token)
      .then((items) => {
        if (!cancelled) {
          setProblems(items);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setInventoryError(nextError instanceof Error ? nextError.message : "Failed to load problems");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const showNotice = useCallback((nextNotice: NoticeState) => {
    setNotice(nextNotice);
  }, []);

  async function handleCreateProblem() {
    setSubmitting(true);
    setFormError(null);

    try {
      const incompleteIndex = testcases.findIndex((testcase) => Boolean(testcase.input) !== Boolean(testcase.output));

      if (incompleteIndex >= 0) {
        throw new Error(`Testcase ${incompleteIndex + 1} must include both input and output files.`);
      }

      const completeTestcases = testcases.filter((testcase) => testcase.input && testcase.output);

      if (completeTestcases.length === 0) {
        throw new Error("At least one hidden testcase is required.");
      }

      const formData = new FormData();

      formData.append("title", form.title);
      formData.append("description", form.description);
      formData.append("difficulty", form.difficulty);
      formData.append("timeLimitMs", String(form.timeLimitMs));
      formData.append("memoryLimitKb", String(form.memoryLimitKb));
      formData.append("supportedLanguages", JSON.stringify(["python", "cpp"]));
      formData.append("sampleInput", form.sampleInput);
      formData.append("sampleOutput", form.sampleOutput);
      formData.append("constraints", form.constraints);
      formData.append("inputSpec", form.inputSpec);
      formData.append("outputSpec", form.outputSpec);
      formData.append("sampleExplanation", form.sampleExplanation);

      completeTestcases
        .forEach((testcase, index) => {
          formData.append(`testcases[${index}][input]`, testcase.input!);
          formData.append(`testcases[${index}][output]`, testcase.output!);
        });

      const response = await createProblem(token, formData);

      setProblems((current) => [response.problem, ...current]);
      setForm(initialFormState);
      setTestcases([createEmptyTestcase()]);
      showNotice({
        type: "success",
        title: "Problem created",
        message: `${response.problem.title} is ready for preview and assignment.`
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to create problem";
      setFormError(message);
      showNotice({
        type: "error",
        title: "Problem validation failed",
        message
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function requestDeleteProblem(problemId: string) {
    setConfirmId(problemId);
    setConfirmImpact(null);
    setForceDeleteConfirmed(false);
    setConfirmLoading(true);
    setInventoryError(null);

    try {
      setConfirmImpact(await getProblemImpact(token, problemId));
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to load delete impact";
      setInventoryError(message);
      showNotice({
        type: "error",
        title: "Impact not loaded",
        message
      });
      setConfirmId(null);
    } finally {
      setConfirmLoading(false);
    }
  }

  async function confirmDelete() {
    if (!confirmId) {
      return;
    }

    try {
      setInventoryError(null);
      await deleteProblem(token, confirmId, forceDeleteConfirmed);
      setProblems((current) => current.filter((problem) => problem.id !== confirmId));
      showNotice({
        type: "success",
        title: "Problem deleted",
        message: `${confirmProblem?.title ?? "Problem"} was removed.`
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to delete problem";
      setInventoryError(message);
      showNotice({
        type: "error",
        title: "Problem not deleted",
        message
      });
    } finally {
      setConfirmId(null);
      setConfirmImpact(null);
      setForceDeleteConfirmed(false);
    }
  }

  async function handleArchiveProblem(problem: ProblemSummary) {
    const archived = !problem.archivedAt;

    try {
      setLifecycleBusyId(problem.id);
      const response = await archiveProblem(token, problem.id, archived);
      setProblems((current) => current.map((item) => item.id === problem.id ? response.problem : item));
      showNotice({
        type: "success",
        title: archived ? "Problem archived" : "Problem restored",
        message: `${problem.title} ${archived ? "will no longer be assignable." : "is assignable again."}`
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to update problem lifecycle";
      setInventoryError(message);
      showNotice({
        type: "error",
        title: "Problem not updated",
        message
      });
    } finally {
      setLifecycleBusyId(null);
    }
  }

  function handleBatchImport(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    const groups = new Map<string, {
      label: string;
      input: File | null;
      output: File | null;
    }>();
    const errors: string[] = [];

    selectedFiles.forEach((file) => {
      const parts = getTestcaseFileParts(file.name);

      if (!parts?.stem.trim()) {
        errors.push(`${file.name} must end with .in or .out.`);
        return;
      }

      const key = parts.stem.toLowerCase();
      const group = groups.get(key) ?? {
        label: parts.stem,
        input: null,
        output: null
      };
      const currentFile = parts.kind === "input" ? group.input : group.output;

      if (currentFile) {
        errors.push(`${parts.stem} has more than one .${parts.kind === "input" ? "in" : "out"} file.`);
        return;
      }

      groups.set(key, {
        ...group,
        [parts.kind]: file
      });
    });

    const importedTestcases = Array.from(groups.values())
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" }))
      .map((group) => {
        if (!group.input || !group.output) {
          errors.push(`${group.label} must include both ${group.label}.in and ${group.label}.out.`);
          return null;
        }

        return createImportedTestcase(group.input, group.output, group.label);
      })
      .filter((testcase): testcase is TestCaseState => Boolean(testcase));

    const existingTestcases = testcases.filter((testcase) => testcase.input || testcase.output);

    if (existingTestcases.length + importedTestcases.length > hiddenTestcaseMaxCount) {
      errors.push(`A problem can have at most ${hiddenTestcaseMaxCount} hidden testcases.`);
    }

    if (errors.length > 0) {
      const message = errors.slice(0, 3).join(" ");
      setFormError(message);
      showNotice({
        type: "error",
        title: "Batch import failed",
        message
      });
      return;
    }

    setFormError(null);
    setTestcases([...existingTestcases, ...importedTestcases]);
    showNotice({
      type: "success",
      title: "Testcases imported",
      message: `${importedTestcases.length} paired testcase(s) were added.`
    });
  }

  function updateTestcase(index: number, patch: Partial<TestCaseState>) {
    setTestcases((current) =>
      current.map((testcase, currentIndex) => (currentIndex === index ? { ...testcase, ...patch } : testcase))
    );
  }

  function removeTestcase(index: number) {
    setFormError(null);
    setTestcases((current) => {
      if (current.length <= 1) {
        return [createEmptyTestcase()];
      }

      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function renderTabContent() {
    if (activeTab === "info") {
      return (
        <>
          <label className="field">
            <span>Title</span>
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </label>

          <label className="field">
            <span>Difficulty</span>
            <select
              value={form.difficulty}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  difficulty: event.target.value as ProblemDifficulty
                }))
              }
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </label>

          <label className="field">
            <span>Time Limit (ms)</span>
            <input
              min={1}
              onChange={(event) => setForm((current) => ({ ...current, timeLimitMs: Number(event.target.value) }))}
              step={1}
              type="number"
              value={form.timeLimitMs}
            />
          </label>

          <label className="field">
            <span>Memory Limit</span>
            <select
              value={form.memoryLimitKb}
              onChange={(event) => setForm((current) => ({ ...current, memoryLimitKb: Number(event.target.value) }))}
            >
              <option value={32768}>32 MB</option>
              <option value={65536}>64 MB</option>
              <option value={131072}>128 MB</option>
              <option value={262144}>256 MB</option>
              <option value={524288}>512 MB</option>
              <option value={1048576}>1 GB</option>
            </select>
          </label>
        </>
      );
    }

    if (activeTab === "description") {
      return (
        <>
          <label className="field">
            <span>Description</span>
            <textarea
              className="text-block"
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              value={form.description}
            />
          </label>
          <label className="field">
            <span>Constraints</span>
            <textarea
              className="text-block"
              value={form.constraints}
              onChange={(e) => setForm(curr => ({ ...curr, constraints: e.target.value }))}
              placeholder="例如：1 <= n <= 10^5"
            />
          </label>
        </>
      );
    }

    // if (activeTab === "sample") {
    //   return (

    // <div className="sample-grid">
    //   <label className="field">
    //     <span>Sample Input</span>
    //     <textarea onChange={(event) => setForm((current) => ({ ...current, sampleInput: event.target.value }))} value={form.sampleInput} />
    //   </label>

    //   <label className="field">
    //     <span>Sample Output</span>
    //     <textarea onChange={(event) => setForm((current) => ({ ...current, sampleOutput: event.target.value }))} value={form.sampleOutput} />
    //   </label>
    // </div>
    //   );
    // }
    if (activeTab === "sample") {
      return (
        <div className="sample-grid-container">
          {/* 1. 新增：輸入與輸出規格說明 */}
          <div className="specs-row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <label className="field">
              <span>Input Specification</span>
              <textarea value={form.inputSpec} onChange={(e) => setForm(curr => ({ ...curr, inputSpec: e.target.value }))} />
            </label>
            <label className="field">
              <span>Output Specification</span>
              <textarea value={form.outputSpec} onChange={(e) => setForm(curr => ({ ...curr, outputSpec: e.target.value }))} />
            </label>
          </div>

          {/* 2. 原有的 Sample Input / Output */}
          <div className="sample-grid2">
            <label className="field">
              <span>Sample Input</span>
              <textarea onChange={(event) => setForm((current) => ({ ...current, sampleInput: event.target.value }))} value={form.sampleInput} />
            </label>

            <label className="field">
              <span>Sample Output</span>
              <textarea onChange={(event) => setForm((current) => ({ ...current, sampleOutput: event.target.value }))} value={form.sampleOutput} />
            </label>
          </div>

          {/* 3. 新增：範例結果解釋 */}
          <label className="field">
            <span>Sample Explanation</span>
            <textarea
              className="text-block"
              value={form.sampleExplanation}
              onChange={(e) => setForm(curr => ({ ...curr, sampleExplanation: e.target.value }))}
            />
          </label>
        </div>
      );
    }

    return (
      <div className="field">
        <span>Testcase Upload</span>

        <div className="batch-import-panel">
          <div>
            <strong>Batch import paired files</strong>
            <p className="helper-text">Select matching files in one action, for example 01.in with 01.out and 02.in with 02.out.</p>
          </div>

          <label className="chip-button file-chip-button">
            <span>Select .in/.out files</span>
            <input
              accept=".in,.out"
              multiple
              onChange={(event) => {
                handleBatchImport(event.target.files);
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
        </div>

        {testcases.map((testcase, index) => (
          <div className="testcase-row" key={testcase.id}>
            <div className="testcase-row-header">
              <div className="testcase-row-title">
                Testcase {index + 1}
                {testcase.label ? <small>({testcase.label})</small> : null}
              </div>
              <button
                aria-label={testcases.length <= 1 ? `Clear testcase ${index + 1}` : `Remove testcase ${index + 1}`}
                className="delete-button testcase-delete-button"
                onClick={() => removeTestcase(index)}
                title={testcases.length <= 1 ? "Clear this testcase row" : "Remove this testcase row"}
                type="button"
              >
                {testcases.length <= 1 ? "Clear" : "Remove"}
              </button>
            </div>

            <label>
              <span>Input (.in)</span>
              <input accept=".in" onChange={(event) => updateTestcase(index, { input: event.target.files?.[0] ?? null })} type="file" />
              {testcase.input ? <small className="upload-success">Uploaded: {testcase.input.name}</small> : null}
            </label>

            <label>
              <span>Output (.out)</span>
              <input accept=".out" onChange={(event) => updateTestcase(index, { output: event.target.files?.[0] ?? null })} type="file" />
              {testcase.output ? <small className="upload-success">Uploaded: {testcase.output.name}</small> : null}
            </label>
          </div>
        ))}

        <button
          className="chip-button"
          disabled={!canAddNewTestCase}
          onClick={() => setTestcases((current) => [...current, createEmptyTestcase()])}
          type="button"
        >
          Add Testcase
        </button>

        {!canAddNewTestCase ? <p className="helper-text">Please upload both input and output before adding the next testcase.</p> : null}
      </div>
    );
  }

  function renderBuilderCard() {
    return (
      <article className="status-card2 panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Problem Builder</p>
            <h2>Create a new problem</h2>
          </div>
        </div>

        <div className="tab-bar">
          {(["info", "description", "sample", "testcase"] as const).map((tab) => (
            <button className={`chip-button ${activeTab === tab ? "active" : ""}`} key={tab} onClick={() => setActiveTab(tab)} type="button">
              {tab === "sample" ? "Sample IO" : tab}
            </button>
          ))}
        </div>

        {renderTabContent()}

        <button className="primary-button" disabled={submitting} onClick={handleCreateProblem} type="button">
          {submitting ? "Creating..." : "Create Problem"}
        </button>

        {formError ? <p className="error-text">{formError}</p> : null}
      </article>
    );
  }

  function renderInventoryCard() {
    return (
      <article className="status-card2 panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Problem Inventory</p>
            <h2>{problems.length} problem(s)</h2>
          </div>
        </div>

        {inventoryError ? <p className="error-text">{inventoryError}</p> : null}

        <div className="result-table2">
          {problems.length === 0 ? (
            <div className="empty-state">No problems yet.</div>
          ) : (
            problems.map((problem) => (
              <div className="problem-table-row" key={problem.id}>
                <div className="problem-title-box">
                  <strong>{problem.title}</strong>
                </div>

                <div className="submission-history-meta">
                  <span>{problem.difficulty}</span>
                  {problem.archivedAt ? <span className="badge badge-warning">archived</span> : <span className="badge badge-success">active</span>}
                </div>
                <button className="chip-button" onClick={() => navigate(`/problem-admin/problems/${problem.id}/preview`)} type="button">
                  Preview
                </button>

                <button
                  className="chip-button"
                  disabled={lifecycleBusyId === problem.id}
                  onClick={() => handleArchiveProblem(problem)}
                  type="button"
                >
                  {problem.archivedAt ? "Restore" : "Archive"}
                </button>

                <button className="delete-button" onClick={() => requestDeleteProblem(problem.id)} type="button">
                  x
                </button>
              </div>
            ))
          )}
        </div>
      </article>
    );
  }

  // if (previewProblemId) {
  //   return (
  //     <div className="candidate-workspace-container fullscreen-preview">
  //       <button className="chip-button preview-back-button" onClick={() => navigate("/problem-admin/problems")} type="button">
  //         Back
  //       </button>

  //       <CandidateWorkspace
  //         key={previewProblemId}
  //         initialProblemId={previewProblemId}
  //         token={token}
  //         user={{
  //           id: "admin-preview",
  //           name: "Admin",
  //           role: "problem_admin",
  //           email: "admin-preview@example.com"
  //         }}
  //       />
  //     </div>
  //   );
  // }
  if (previewProblemId) {
    return (
      <div className="fullscreen-preview-container">
        {/* 上側工具列 */}
        <div className="preview-top-bar">
          <button
            className="chip-button"
            onClick={() => navigate("/problem-admin/problems")}
            type="button"
          >
            ← Back to Inventory
          </button>
          <span className="preview-mode-badge">
            【Admin Preview Mode】
          </span>
        </div>

        {/* 下方內容區 */}
        <div className="preview-workspace-body">
          <CandidateWorkspace
            key={previewProblemId}
            initialProblemId={previewProblemId}
            token={token}
            user={{
              // id: "admin-preview",
              id: currentUserId,
              name: "Admin",
              role: "problem_admin",
              email: "admin-preview@example.com"
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="workspace-container dashboard-page">
        <header className="workspace-header">
          <h1>Admin Dashboard</h1>
          <p className="subtitle text-muted">Create, validate, preview, and retire coding problems.</p>
        </header>

        <section className="dashboard-metrics">
          <article className="metric-card">
            <span>Total Problems</span>
            <strong>{problems.length}</strong>
          </article>
          <article className="metric-card">
            <span>Easy</span>
            <strong>{difficultyCounts.easy}</strong>
          </article>
          <article className="metric-card">
            <span>Medium</span>
            <strong>{difficultyCounts.medium}</strong>
          </article>
          <article className="metric-card">
            <span>Hard</span>
            <strong>{difficultyCounts.hard}</strong>
          </article>
        </section>

        {activeSection === "dashboard" ? (
          <section className="workspace-grid2">
            {renderBuilderCard()}
            {renderInventoryCard()}
          </section>
        ) : null}

        {activeSection === "new" ? <section className="workspace-grid single-column-grid">{renderBuilderCard()}</section> : null}

        {activeSection === "problems" ? <section className="workspace-grid single-column-grid">{renderInventoryCard()}</section> : null}

        {activeSection === "submissions" ? (
          <section className="workspace-grid single-column-grid">
            <AdminSubmissionHistory token={token} />
          </section>
        ) : null}

        {activeSection === "users" ? (
          <section className="workspace-grid single-column-grid">
            <UserManager currentUserId={currentUserId} onNotice={showNotice} token={token} />
          </section>
        ) : null}
      </div>

      {notice ? (
        <div className={`toast floating-toast toast-${notice.type}`} role="status">
          <strong>{notice.title}</strong>
          <span>{notice.message}</span>
          <button className="toast-close-button" onClick={() => setNotice(null)} type="button">
            x
          </button>
        </div>
      ) : null}

      {confirmId ? (
        <div className="modal-backdrop">
          <div className="modal modal-wide">
            <p>Delete problem</p>
            <p className="modal-target-title">{confirmProblem?.title}</p>

            {confirmLoading ? (
              <div className="empty-state">Loading impact...</div>
            ) : confirmImpact ? (
              <div className="impact-grid">
                <div>
                  <span>Assignments</span>
                  <strong>{confirmImpact.assignments}</strong>
                </div>
                <div>
                  <span>Candidate submissions</span>
                  <strong>{confirmImpact.candidateSubmissions}</strong>
                </div>
                <div>
                  <span>Preview submissions</span>
                  <strong>{confirmImpact.previewSubmissions}</strong>
                </div>
                <div>
                  <span>Reviews</span>
                  <strong>{confirmImpact.reviews}</strong>
                </div>
              </div>
            ) : null}

            {confirmImpact && !confirmImpact.canDeleteWithoutForce ? (
              <label className="force-delete-check">
                <input
                  checked={forceDeleteConfirmed}
                  onChange={(event) => setForceDeleteConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>Force delete assignments, submissions, testcase results, and reviews for this problem.</span>
              </label>
            ) : null}

            <div className="modal-actions">
              <button className="chip-button" onClick={() => {
                setConfirmId(null);
                setConfirmImpact(null);
                setForceDeleteConfirmed(false);
              }} type="button">
                Cancel
              </button>

              <button
                className="chip-button"
                disabled={confirmLoading || Boolean(confirmImpact && !confirmImpact.canDeleteWithoutForce && !forceDeleteConfirmed)}
                onClick={confirmDelete}
                type="button"
              >
                {forceDeleteConfirmed ? "Force Delete" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function UserManager({
  currentUserId,
  onNotice,
  token
}: {
  currentUserId: string;
  onNotice: (notice: NoticeState) => void;
  token: string;
}) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("candidate");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getUsers(token)
      .then((items) => {
        if (!cancelled) {
          setUsers(items);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          const message = nextError instanceof Error ? nextError.message : "Failed to load users";
          setError(message);
          onNotice({
            type: "error",
            title: "Users not loaded",
            message
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onNotice, token]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const response = await createUser(token, {
        name: name.trim(),
        email: email.trim(),
        role
      });

      setUsers((current) => [...current, response.user].sort(compareUsers));
      setName("");
      setEmail("");
      setRole("candidate");
      onNotice({
        type: "success",
        title: "User created",
        message: `${response.user.name} can now sign in as ${roleLabels[response.user.role]}.`
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to create user";
      setError(message);
      onNotice({
        type: "error",
        title: "User not created",
        message
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteUser(user: AuthUser) {
    setDeletingId(user.id);
    setError(null);

    try {
      await deleteUser(token, user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      onNotice({
        type: "success",
        title: "User deleted",
        message: `${user.name} was removed.`
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to delete user";
      setError(message);
      onNotice({
        type: "error",
        title: "User not deleted",
        message
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <article className="status-card panel-column">
      <div className="panel-header">
        <div>
          <p className="eyebrow">User Management</p>
          <h2>Accounts and roles</h2>
        </div>
      </div>

      <div className="user-management-grid">
        <form className="stack-form admin-user-form" onSubmit={handleCreateUser}>
          <label className="field">
            <span>Name</span>
            <input onChange={(event) => setName(event.target.value)} placeholder="New teammate" value={name} />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Role</span>
            <select onChange={(event) => setRole(event.target.value as UserRole)} value={role}>
              {roles.map((item) => (
                <option key={item} value={item}>
                  {roleLabels[item]}
                </option>
              ))}
            </select>
          </label>

          <button className="primary-button" disabled={creating || !name.trim() || !email.trim()} type="submit">
            {creating ? "Creating..." : "Create User"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </form>

        <div className="result-table user-table">
          {loading ? (
            <div className="empty-state">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="empty-state">No users yet.</div>
          ) : (
            users.map((user) => (
              <div className="user-table-row" key={user.id}>
                <div className="candidate-info">
                  <strong className="candidate-name">{user.name}</strong>
                  <span className="candidate-email">{user.email}</span>
                  <small>{user.id}</small>
                </div>

                <span className="badge badge-outline">{roleLabels[user.role]}</span>

                <button
                  className="delete-button"
                  disabled={user.id === currentUserId || deletingId === user.id}
                  onClick={() => handleDeleteUser(user)}
                  title={user.id === currentUserId ? "You cannot delete the account currently signed in." : "Delete user"}
                  type="button"
                >
                  {deletingId === user.id ? "..." : "x"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  );
}

function AdminSubmissionHistory({ token }: { token: string }) {
  const [submissions, setSubmissions] = useState<SubmissionHistoryItem[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<VerdictKind | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getAdminSubmissionHistory(token)
      .then((items) => {
        if (!cancelled) {
          setSubmissions(items);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load submissions");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const filteredSubmissions = submissions.filter((submission) => {
    const matchesVerdict = verdictFilter === "all" || getSubmissionVerdict(submission).kind === verdictFilter;
    const normalizedQuery = query.trim().toLowerCase();

    if (!matchesVerdict) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [
      submission.problemTitle,
      submission.candidateName,
      submission.candidateEmail,
      submission.id,
      submission.language
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  return (
    <article className="status-card panel-column">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Submission History</p>
          <h2>{filteredSubmissions.length} submission(s)</h2>
        </div>
      </div>

      <div className="inline-form">
        <label className="field flex-grow">
          <span>Search</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Candidate, problem, language, or submission id"
            value={query}
          />
        </label>

        <label className="field">
          <span>Verdict</span>
          <select onChange={(event) => setVerdictFilter(event.target.value as VerdictKind | "all")} value={verdictFilter}>
            <option value="all">All</option>
            {verdictFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <SubmissionHistoryPanel
        emptyMessage="No submissions found."
        loading={loading}
        onSelect={(submission) => setSelectedSubmissionId(submission.id)}
        selectedId={selectedSubmissionId}
        submissions={filteredSubmissions}
      />
    </article>
  );
}

function compareUsers(left: AuthUser, right: AuthUser) {
  return `${left.role}:${left.name}:${left.email}`.localeCompare(`${right.role}:${right.name}:${right.email}`);
}
