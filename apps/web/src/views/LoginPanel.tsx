import { useState } from "react";

interface LoginPanelProps {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginPanel({ isLoading, error, onLogin }: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email.trim(), password);
  }

  return (
    <section className="login-panel">
      <article className="login-copy">
        <div className="brand-lockup brand-lockup-large">
          <div className="brand-mark">OCT</div>
          <div>
            <strong>Online Code Test</strong>
            <span>Coding interview workspace</span>
          </div>
        </div>
        <h1>Sign in.</h1>
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

          <label className="field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              type="password"
              value={password}
            />
          </label>

          <button className="primary-button" disabled={isLoading || !email.trim() || !password} type="submit">
            {isLoading ? "Signing In..." : "Sign In"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </article>
    </section>
  );
}
