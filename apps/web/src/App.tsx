import { useEffect, useState } from "react";
import type { AuthUser } from "@oct/contracts";

import { getHealth, getMe, loginWithEmail } from "./lib/api";
import { clearStoredSession, loadStoredSession, saveStoredSession } from "./lib/session";
import { CandidateWorkspace } from "./views/CandidateWorkspace";
import { LoginPanel } from "./views/LoginPanel";

interface HealthState {
  status: "idle" | "ready" | "error";
  message: string;
}

interface SessionState {
  token: string;
  user: AuthUser;
}

const roleCopy = {
  candidate: "Candidate workspace is live. You can already test assignments, problem detail, submission, and result polling.",
  interviewer: "Interviewer workspace lands in the next commit. Backend APIs are already ready.",
  problem_admin: "Problem admin workspace lands in the next commit. Backend APIs are already ready."
} satisfies Record<AuthUser["role"], string>;

export function App() {
  const [health, setHealth] = useState<HealthState>({
    status: "idle",
    message: "Checking API status..."
  });
  const [session, setSession] = useState<SessionState | null>(() => loadStoredSession());
  const [sessionLoading, setSessionLoading] = useState(Boolean(loadStoredSession()));
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then(() => {
        if (cancelled) {
          return;
        }

        setHealth({
          status: "ready",
          message: "API is reachable on localhost:3000"
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setHealth({
          status: "error",
          message: "Cannot reach API. Start backend with npm run dev:api"
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setSessionLoading(false);
      return;
    }

    let cancelled = false;

    getMe(session.token)
      .then((user) => {
        if (cancelled) {
          return;
        }

        const nextSession = { token: session.token, user };
        setSession(nextSession);
        saveStoredSession(nextSession);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        clearStoredSession();
        setSession(null);
      })
      .finally(() => {
        if (!cancelled) {
          setSessionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  async function handleLogin(email: string) {
    setLoginLoading(true);
    setLoginError(null);

    try {
      const response = await loginWithEmail(email);
      const nextSession = {
        token: response.token,
        user: response.user
      };

      saveStoredSession(nextSession);
      setSession(nextSession);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearStoredSession();
    setSession(null);
    setLoginError(null);
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-row">
          <div>
            <p className="eyebrow">Frontend MVP</p>
            <h1>Online Code Test</h1>
            <p className="hero-copy">
              A role-aware frontend base that teammates can extend without debugging raw API calls
              from scratch.
            </p>
          </div>

          <div className={`health-indicator health-${health.status}`}>
            <span className="health-dot" />
            <span>{health.message}</span>
          </div>
        </div>
      </section>

      {!session || sessionLoading ? (
        <LoginPanel
          health={health}
          isLoading={loginLoading || sessionLoading}
          error={loginError}
          onLogin={handleLogin}
        />
      ) : (
        <>
          <section className="session-strip">
            <div>
              <p className="eyebrow">Current Session</p>
              <div className="session-heading">
                <h2>{session.user.name}</h2>
                <span className="role-badge">{session.user.role}</span>
              </div>
              <p className="session-copy">{roleCopy[session.user.role]}</p>
            </div>

            <button className="secondary-button" onClick={handleLogout} type="button">
              Log Out
            </button>
          </section>

          {session.user.role === "candidate" ? (
            <CandidateWorkspace token={session.token} user={session.user} />
          ) : (
            <section className="status-grid">
              <article className="status-card">
                <h2>{session.user.role} workspace</h2>
                <p>{roleCopy[session.user.role]}</p>
              </article>

              <article className="status-card">
                <h2>Backend Is Ready</h2>
                <p>
                  The admin APIs are already live. The next commit will expose a frontend surface for
                  them.
                </p>
              </article>
            </section>
          )}
        </>
      )}
    </main>
  );
}
