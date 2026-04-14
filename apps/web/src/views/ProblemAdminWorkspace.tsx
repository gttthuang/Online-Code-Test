import { useEffect, useState } from "react";
import type { ProblemDifficulty, ProblemSummary } from "@oct/contracts";

import { createProblem, getAdminProblems } from "../lib/api";

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

  return (
    <section className="workspace-grid">
      <article className="status-card panel-column">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Problem Builder</p>
            <h2>Create a new problem</h2>
          </div>
        </div>

        <label className="field">
          <span>Title</span>
          <input onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} value={form.title} />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="text-block"
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            value={form.description}
          />
        </label>

        <label className="field">
          <span>Difficulty</span>
          <select
            onChange={(event) =>
              setForm((current) => ({ ...current, difficulty: event.target.value as ProblemDifficulty }))
            }
            value={form.difficulty}
          >
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>

        <div className="sample-grid">
          <label className="field">
            <span>Sample Input</span>
            <textarea
              className="text-block"
              onChange={(event) => setForm((current) => ({ ...current, sampleInput: event.target.value }))}
              value={form.sampleInput}
            />
          </label>

          <label className="field">
            <span>Sample Output</span>
            <textarea
              className="text-block"
              onChange={(event) => setForm((current) => ({ ...current, sampleOutput: event.target.value }))}
              value={form.sampleOutput}
            />
          </label>
        </div>

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
            <div className="table-row" key={problem.id}>
              <div>
                <strong>{problem.title}</strong>
                <small>{problem.id}</small>
              </div>
              <span>{problem.difficulty}</span>
              <span>{problem.supportedLanguages.join(", ")}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
