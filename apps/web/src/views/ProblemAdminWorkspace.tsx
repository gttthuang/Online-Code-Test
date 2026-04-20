import { useEffect, useState } from "react";
import type { ProblemDifficulty, ProblemSummary } from "@oct/contracts";

import { createProblem, getAdminProblems, deleteProblem } from "../lib/api";

interface ProblemAdminWorkspaceProps {
  token: string;
}

interface ProblemFormState {
  title: string;
  description: string;
  difficulty: ProblemDifficulty;
  sampleInput: string;
  sampleOutput: string;
}

const initialFormState: ProblemFormState = {
  title: "FizzBuzz",
  description: "Return the fizz buzz sequence for numbers from 1 to n.",
  difficulty: "easy",
  sampleInput: "5",
  sampleOutput: "1 2 fizz 4 buzz"
};



export function ProblemAdminWorkspace({ token }: ProblemAdminWorkspaceProps) {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [form, setForm] = useState<ProblemFormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("info");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmProblem = problems.find(
    (p) => p.id === confirmId
  );

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
      const response = await createProblem(token, {
        title: form.title,
        description: form.description,
        difficulty: form.difficulty,
        timeLimitMs: 1000,
        memoryLimitKb: 65536,
        supportedLanguages: ["python", "cpp"],
        sampleInput: form.sampleInput,
        sampleOutput: form.sampleOutput,
        hiddenTestCases: [
          {
            input: form.sampleInput,
            expectedOutput: form.sampleOutput
          }
        ]
      });

      setProblems((current) => [response.problem, ...current]);
      setForm(initialFormState);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create problem");
    } finally {
      setSubmitting(false);
    }
  }
  async function handleDeleteProblem(problemId: string) {

    try {
      await deleteProblem(token, problemId);

      setProblems((current) =>
        current.filter((p) => p.id !== problemId)
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete problem"
      );
    }
  }
  async function confirmDelete() {
    if (!confirmId) return;

    try {
      await deleteProblem(token, confirmId);

      setProblems((current) =>
        current.filter((p) => p.id !== confirmId)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete problem");
    } finally {
      setConfirmId(null);
    }
  }
  function cancelDelete() {
    setConfirmId(null);
  }

  function renderTabContent() {
    if (activeTab === "info") {
      return (
        <>
          <label className="field">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(e) =>
                setForm((c) => ({ ...c, title: e.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Difficulty</span>
            <select
              value={form.difficulty}
              onChange={(e) =>
                setForm((c) => ({
                  ...c,
                  difficulty: e.target.value as ProblemDifficulty,
                }))
              }
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
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
            value={form.description}
            onChange={(e) =>
              setForm((c) => ({ ...c, description: e.target.value }))
            }
          />
        </label>
      );
    }

    if (activeTab === "sample") {
      return (
        <div className="sample-grid">
          <label className="field">
            <span>Sample Input</span>
            <textarea
              value={form.sampleInput}
              onChange={(e) =>
                setForm((c) => ({ ...c, sampleInput: e.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Sample Output</span>
            <textarea
              value={form.sampleOutput}
              onChange={(e) =>
                setForm((c) => ({ ...c, sampleOutput: e.target.value }))
              }
            />
          </label>
        </div>
      );
    }

    if (activeTab === "testcase") {
      return <div className="empty-state">Testcase editor coming soon</div>;
    }

    return null;
  }

  return (
    <>
    <section className="workspace-grid">
      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Problem Builder</p>
            <h2>Create a new problem</h2>
          </div>
        </div>
        <div className="tab-bar">
          <button
            className={`chip-button ${activeTab === "info" ? "active" : ""}`}
            onClick={() => setActiveTab("info")}
            type="button"
          >
            Info
          </button>

          <button
            className={`chip-button ${activeTab === "description" ? "active" : ""}`}
            onClick={() => setActiveTab("description")}
            type="button"
          >
            Description
          </button>

          <button
            className={`chip-button ${activeTab === "sample" ? "active" : ""}`}
            onClick={() => setActiveTab("sample")}
            type="button"
          >
            Sample IO
          </button>

          <button
            className={`chip-button ${activeTab === "testcase" ? "active" : ""}`}
            onClick={() => setActiveTab("testcase")}
            type="button"
          >
            Testcase
          </button>
        </div>

        {renderTabContent()}

        <button className="primary-button" disabled={submitting} onClick={handleCreateProblem} type="button">
          {submitting ? "Creating..." : "Create Problem"}
        </button>

        {error ? <p className="error-text">{error}</p> : null}
      </article>

      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Problem Inventory</p>
            <h2>{problems.length} problem(s)</h2>
          </div>
        </div>

        <div className="result-table">
          {problems.map((problem) => (
            <div className="problem-table-row" key={problem.id}>
              <div>
                <strong>{problem.title}</strong>
                <small>{problem.id}</small>
              </div>

              <span>{problem.difficulty}</span>
              <span>{problem.supportedLanguages.join(", ")}</span>

              <button
                className="delete-button"
                onClick={() => setConfirmId(problem.id)}
                type="button"
              >
                x
              </button>
            </div>
          ))}
          
        </div>
        
      </article>
    </section>
    {confirmId && (
      <div className="modal-backdrop">
        <div className="modal">
          <p>請先確認此題未被用於任何測驗或提交中，確定刪除：</p>
          <p style={{ marginTop: 8, fontWeight: 600 }}>
            {confirmProblem?.title}
          </p>
          <p>這個題目嗎？</p>
          <div className="modal-actions">
            <button
              className="chip-button"
              onClick={() => setConfirmId(null)}
              type="button"
            >
              取消
            </button>

            <button
              className="chip-button"
              onClick={async () => {
                await handleDeleteProblem(confirmId);
                setConfirmId(null);
              }}
              type="button"
            >
              確定刪除
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
