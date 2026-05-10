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
  TestCaseState: TestCaseState;
}
interface TestCaseState {
  input: File | null;
  output: File | null;
  timeLimitMs: number;
  memoryLimitKb: number;
}

const initialFormState: ProblemFormState = {
  title: "FizzBuzz",
  description: "Return the fizz buzz sequence for numbers from 1 to n.",
  difficulty: "easy",
  sampleInput: "5",
  sampleOutput: "1 2 fizz 4 buzz",
  TestCaseState: {
    input: null,
    output: null,
    timeLimitMs: 1000,
    memoryLimitKb: 65536
  }

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
  const [testcases, setTestcases] = useState<TestCaseState[]>([
    { input: null, output: null, timeLimitMs: 1000, memoryLimitKb: 65536 }
  ]);
  
  const canAddNewTestCase =
    testcases.length === 0 ||
    (testcases[testcases.length - 1].input &&
    testcases[testcases.length - 1].output);

  const fileToText = async (file: File) => {
    return await file.text();
  };

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
      // const parsedTestcases = await Promise.all(
      //   testcases
      //     .filter(tc => tc.input && tc.output)
      //     .map(async (tc) => ({
      //       input: await fileToText(tc.input!),
      //       expectedOutput: await fileToText(tc.output!),
      //       timeLimitMs: tc.timeLimitMs,
      //       memoryLimitKb: tc.memoryLimitKb
      //     }))
      // );
      // const response = await createProblem(token, {
      //   title: form.title,
      //   description: form.description,
      //   difficulty: form.difficulty,
      //   timeLimitMs: 1000,
      //   memoryLimitKb: 65536,
      //   supportedLanguages: ["python", "cpp"],
      //   sampleInput: form.sampleInput,
      //   sampleOutput: form.sampleOutput,
      //   // hiddenTestCases: [
      //   //   {
      //   //     input: form.sampleInput,
      //   //     expectedOutput: form.sampleOutput
      //   //   }
      //   // ]
      //   hiddenTestCases: parsedTestcases
      // });
      const formData = new FormData();

      formData.append("title", form.title);
      formData.append("description", form.description);
      formData.append("difficulty", form.difficulty);
      formData.append("timeLimitMs", "1000");
      formData.append("memoryLimitKb", "65536");
      formData.append("supportedLanguages", JSON.stringify(["python", "cpp"]));
      formData.append("sampleInput", form.sampleInput);
      formData.append("sampleOutput", form.sampleOutput);

      // hidden testcases
      testcases
        .filter(tc => tc.input && tc.output)
        .forEach((tc, idx) => {
          formData.append(`testcases[${idx}][input]`, tc.input!);
          formData.append(`testcases[${idx}][output]`, tc.output!);
          formData.append(`testcases[${idx}][timeLimitMs]`, String(tc.timeLimitMs));
          formData.append(`testcases[${idx}][memoryLimitKb]`, String(tc.memoryLimitKb));
        });

      const response = await createProblem(token, formData);

      setProblems((current) => [response.problem, ...current]);
      setForm(initialFormState);
      setTestcases([
        { input: null, output: null, timeLimitMs: 1000, memoryLimitKb: 65536 }
      ]);
      
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create problem");
    } finally {
      setSubmitting(false);
    }
  }
  // async function handleDeleteProblem(problemId: string) {

  //   try {
  //     await deleteProblem(token, problemId);

  //     setProblems((current) =>
  //       current.filter((p) => p.id !== problemId)
  //     );
  //   } catch (err) {
  //     setError(
  //       err instanceof Error ? err.message : "Failed to delete problem"
  //     );
  //   }
  // }
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

    // if (activeTab === "testcase") {
    //   return <div className="empty-state">Testcase editor coming soon</div>;
    // }
    if (activeTab === "testcase") {
      return (
        <div className="field">
          <span style={{ fontWeight: 600 }}>Testcase Upload</span>

          {testcases.map((tc, index) => {
            const isComplete = tc.input && tc.output;

            return (
              <div
                key={index}
                className="testcase-row"
                style={{
                  border: "1px solid #ddd",
                  padding: 12,
                  marginBottom: 12,
                  borderRadius: 8
                }}
              >
                {/* Label */}
                <div style={{ fontWeight: 600, marginBottom: 10 }}>
                  Testcase {index + 1}
                </div>

                {/* Input file */}
                <div>
                  <label>Input (.in)</label>
                  <input
                    type="file"
                    accept=".in"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;

                      setTestcases((prev) =>
                        prev.map((t, i) =>
                          i === index ? { ...t, input: file } : t
                        )
                      );
                    }}
                  />
                  {tc.input && (
                    <small style={{ color: "green" }}>
                      ✓ uploaded: {tc.input.name}
                    </small>
                  )}
                </div>

                {/* Output file */}
                <div>
                  <label>Output (.out)</label>
                  <input
                    type="file"
                    accept=".out"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;

                      setTestcases((prev) =>
                        prev.map((t, i) =>
                          i === index ? { ...t, output: file } : t
                        )
                      );
                    }}
                  />
                  {tc.output && (
                    <small style={{ color: "green" }}>
                      ✓ uploaded: {tc.output.name}
                    </small>
                  )}
                </div>

                {/* Time limit */}
                <div style={{ marginTop: 10 }}>
                  <label>Time Limit (ms)</label>
                  <input
                    type="number"
                    value={tc.timeLimitMs}
                    onChange={(e) => {
                      const value = Number(e.target.value);

                      setTestcases((prev) =>
                        prev.map((t, i) =>
                          i === index ? { ...t, timeLimitMs: value } : t
                        )
                      );
                    }}
                  />
                </div>

                {/* Memory limit */}
                <div>
                  <label>Memory Limit (KB)</label>
                  <input
                    type="number"
                    value={tc.memoryLimitKb}
                    onChange={(e) => {
                      const value = Number(e.target.value);

                      setTestcases((prev) =>
                        prev.map((t, i) =>
                          i === index ? { ...t, memoryLimitKb: value } : t
                        )
                      );
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Add button */}
          <button
            className="chip-button"
            type="button"
            disabled={
              !canAddNewTestCase
              // testcases.length > 0 &&
              // !(testcases[testcases.length - 1].input && testcases[testcases.length - 1].output)
            }
            onClick={() =>
              setTestcases((prev) => [
                ...prev,
                {
                  input: null,
                  output: null,
                  timeLimitMs: 1000,
                  memoryLimitKb: 65536
                }
              ])
            }
          >
            + Add Testcase
          </button>

          {/* helper text */}
          {!canAddNewTestCase && (
              <p style={{ color: "gray", marginTop: 8 }}>
                Please upload both input & output before adding next testcase
              </p>
            )}

        </div>
      );
    }

    return null;
  }

  return (
    <>
      <div className="workspace-container">
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
      </div>
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
                onClick={cancelDelete}
                type="button"
              >
                取消
              </button>

              <button
                className="chip-button"
                onClick={
                  confirmDelete
                }
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
