import { useEffect, useMemo, useState } from "react";
import type { ProblemDifficulty, ProblemSummary } from "@oct/contracts";
import { useLocation, useNavigate } from "react-router-dom";

import { createProblem, deleteProblem, getAdminProblems } from "../lib/api";
import { CandidateWorkspace } from "../views/CandidateWorkspace";

interface ProblemAdminWorkspaceProps {
  token: string;
}

interface TestCaseState {
  input: File | null;
  output: File | null;
}

interface ProblemFormState {
  title: string;
  description: string;
  difficulty: ProblemDifficulty;
  sampleInput: string;
  sampleOutput: string;
  timeLimitMs: number;
  memoryLimitKb: number;
}

const initialFormState: ProblemFormState = {
  title: "FizzBuzz",
  description: "Return the fizz buzz sequence for numbers from 1 to n.",
  difficulty: "easy",
  sampleInput: "5",
  sampleOutput: "1 2 fizz 4 buzz",
  timeLimitMs: 1000,
  memoryLimitKb: 65536
};

export function ProblemAdminWorkspace({ token }: ProblemAdminWorkspaceProps) {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [form, setForm] = useState<ProblemFormState>(initialFormState);
  const [testcases, setTestcases] = useState<TestCaseState[]>([{ input: null, output: null }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "description" | "sample" | "testcase">("info");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const previewProblemId = location.pathname.match(/^\/problem-admin\/problems\/([^/]+)\/preview$/)?.[1] ?? null;
  const activeSection = location.pathname.includes("/new")
    ? "new"
    : location.pathname.includes("/problems")
      ? "problems"
      : "dashboard";

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
          setError(nextError instanceof Error ? nextError.message : "Failed to load problems");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleCreateProblem() {
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();

      formData.append("title", form.title);
      formData.append("description", form.description);
      formData.append("difficulty", form.difficulty);
      formData.append("timeLimitMs", String(form.timeLimitMs));
      formData.append("memoryLimitKb", String(form.memoryLimitKb));
      formData.append("supportedLanguages", JSON.stringify(["python", "cpp"]));
      formData.append("sampleInput", form.sampleInput);
      formData.append("sampleOutput", form.sampleOutput);

      testcases
        .filter((testcase) => testcase.input && testcase.output)
        .forEach((testcase, index) => {
          formData.append(`testcases[${index}][input]`, testcase.input!);
          formData.append(`testcases[${index}][output]`, testcase.output!);
        });

      const response = await createProblem(token, formData);

      setProblems((current) => [response.problem, ...current]);
      setForm(initialFormState);
      setTestcases([{ input: null, output: null }]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create problem");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!confirmId) {
      return;
    }

    try {
      await deleteProblem(token, confirmId);
      setProblems((current) => current.filter((problem) => problem.id !== confirmId));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to delete problem");
    } finally {
      setConfirmId(null);
    }
  }

  function updateTestcase(index: number, patch: Partial<TestCaseState>) {
    setTestcases((current) =>
      current.map((testcase, currentIndex) => (currentIndex === index ? { ...testcase, ...patch } : testcase))
    );
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
              min={100}
              onChange={(event) => setForm((current) => ({ ...current, timeLimitMs: Number(event.target.value) }))}
              step={100}
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
        <label className="field">
          <span>Description</span>
          <textarea
            className="text-block"
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            value={form.description}
          />
        </label>
      );
    }

    if (activeTab === "sample") {
      return (
        <div className="sample-grid">
          <label className="field">
            <span>Sample Input</span>
            <textarea onChange={(event) => setForm((current) => ({ ...current, sampleInput: event.target.value }))} value={form.sampleInput} />
          </label>

          <label className="field">
            <span>Sample Output</span>
            <textarea onChange={(event) => setForm((current) => ({ ...current, sampleOutput: event.target.value }))} value={form.sampleOutput} />
          </label>
        </div>
      );
    }

    return (
      <div className="field">
        <span>Testcase Upload</span>

        {testcases.map((testcase, index) => (
          <div className="testcase-row" key={index}>
            <div className="testcase-row-title">Testcase {index + 1}</div>

            <label>
              Input (.in)
              <input accept=".in" onChange={(event) => updateTestcase(index, { input: event.target.files?.[0] ?? null })} type="file" />
              {testcase.input ? <small className="upload-success">Uploaded: {testcase.input.name}</small> : null}
            </label>

            <label>
              Output (.out)
              <input accept=".out" onChange={(event) => updateTestcase(index, { output: event.target.files?.[0] ?? null })} type="file" />
              {testcase.output ? <small className="upload-success">Uploaded: {testcase.output.name}</small> : null}
            </label>
          </div>
        ))}

        <button
          className="chip-button"
          disabled={!canAddNewTestCase}
          onClick={() => setTestcases((current) => [...current, { input: null, output: null }])}
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
      <article className="status-card panel-column">
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

        {error ? <p className="error-text">{error}</p> : null}
      </article>
    );
  }

  function renderInventoryCard() {
    return (
      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Problem Inventory</p>
            <h2>{problems.length} problem(s)</h2>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="result-table">
          {problems.length === 0 ? (
            <div className="empty-state">No problems yet.</div>
          ) : (
            problems.map((problem) => (
              <div className="problem-table-row" key={problem.id}>
                <div>
                  <strong>{problem.title}</strong>
                  <small>{problem.id}</small>
                </div>

                <span>{problem.difficulty}</span>
                <button className="chip-button" onClick={() => navigate(`/problem-admin/problems/${problem.id}/preview`)} type="button">
                  Preview
                </button>

                <button className="delete-button" onClick={() => setConfirmId(problem.id)} type="button">
                  x
                </button>
              </div>
            ))
          )}
        </div>
      </article>
    );
  }

  if (previewProblemId) {
    return (
      <div className="candidate-workspace-container fullscreen-preview">
        <button className="chip-button preview-back-button" onClick={() => navigate("/problem-admin/problems")} type="button">
          Back
        </button>

        <CandidateWorkspace
          key={previewProblemId}
          initialProblemId={previewProblemId}
          token={token}
          user={{
            id: "admin-preview",
            name: "Admin",
            role: "problem_admin",
            email: "admin-preview@example.com"
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="workspace-container dashboard-page">
        <header className="workspace-header">
          <h1>Problem Admin Dashboard</h1>
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
          <section className="workspace-grid">
            {renderBuilderCard()}
            {renderInventoryCard()}
          </section>
        ) : null}

        {activeSection === "new" ? <section className="workspace-grid single-column-grid">{renderBuilderCard()}</section> : null}

        {activeSection === "problems" ? <section className="workspace-grid single-column-grid">{renderInventoryCard()}</section> : null}
      </div>

      {confirmId ? (
        <div className="modal-backdrop">
          <div className="modal">
            <p>Confirm this problem is not used by any assignment or submission before deleting:</p>
            <p className="modal-target-title">{confirmProblem?.title}</p>
            <div className="modal-actions">
              <button className="chip-button" onClick={() => setConfirmId(null)} type="button">
                Cancel
              </button>

              <button className="chip-button" onClick={confirmDelete} type="button">
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
