import { useState } from "react";

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
  const [email, setEmail] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email.trim());
  }

  return (
    <section className="login-panel">
      <article className="login-copy">
        <div className="brand-lockup brand-lockup-large">
          <div className="brand-mark">OCT</div>
          <div>
            <strong>Online Code Test</strong>
            <span>Interview coding workspace</span>
          </div>
        </div>
        <h1>Sign in to your assigned workspace.</h1>
        {health.status === "error" ? (
          <div className={`health-indicator health-${health.status}`}>
            <span className="health-dot" />
            <span>{health.message}</span>
          </div>
        ) : null}
      </article>

      <article className="login-card">
        <p className="eyebrow">Login</p>
        <form className="stack-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              type="email"
              value={email}
            />
          </label>

          <button className="primary-button" disabled={isLoading || health.status === "error" || !email.trim()} type="submit">
            {isLoading ? "Signing In..." : "Sign In"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </article>
    </section>
  );
}
