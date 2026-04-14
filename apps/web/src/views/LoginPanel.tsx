import { useState } from "react";

const demoAccounts = [
  {
    label: "Candidate",
    email: "alice.candidate@example.com",
    note: "Best for testing assignment, code submission, and result polling."
  },
  {
    label: "Interviewer",
    email: "bob.interviewer@example.com",
    note: "Will be used in the next admin-facing frontend commit."
  },
  {
    label: "Problem Admin",
    email: "cindy.problem_admin@example.com",
    note: "Will be used in the next admin-facing frontend commit."
  }
];

interface LoginPanelProps {
  health: {
    status: "idle" | "ready" | "error";
    message: string;
  };
  isLoading: boolean;
  error: string | null;
  onLogin: (email: string) => Promise<void>;
}

export function LoginPanel({ health, isLoading, error, onLogin }: LoginPanelProps) {
  const [email, setEmail] = useState("alice.candidate@example.com");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email);
  }

  return (
    <section className="workspace-grid">
      <article className="status-card">
        <p className="eyebrow">Demo Access</p>
        <h2>Pick an account and get a token-backed session.</h2>
        <p className="panel-copy">
          The current backend uses demo login by email. After login, the frontend stores the token
          locally and uses it for all protected API calls.
        </p>

        <div className="demo-list">
          {demoAccounts.map((account) => (
            <button
              key={account.email}
              className={`demo-account ${email === account.email ? "demo-account-active" : ""}`}
              onClick={() => setEmail(account.email)}
              type="button"
            >
              <strong>{account.label}</strong>
              <span>{account.email}</span>
              <small>{account.note}</small>
            </button>
          ))}
        </div>
      </article>

      <article className="status-card">
        <p className="eyebrow">Login</p>
        <form className="stack-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>

          <button className="primary-button" disabled={isLoading || health.status === "error"} type="submit">
            {isLoading ? "Signing In..." : "Sign In"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </article>
    </section>
  );
}
