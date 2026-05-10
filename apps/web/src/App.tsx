import { useEffect, useState } from "react";
import type { AuthUser } from "@oct/contracts";

import { getHealth, getMe, loginWithEmail } from "./lib/api";
import { clearStoredSession, loadStoredSession, saveStoredSession } from "./lib/session";
import { CandidateWorkspace } from "./views/CandidateWorkspace";
import { InterviewerWorkspace } from "./views/InterviewerWorkspace";
import { LoginPanel } from "./views/LoginPanel";
import { ProblemAdminWorkspace } from "./views/ProblemAdminWorkspace";

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
  interviewer: "Interviewer workspace is live. You can assign problems and inspect candidate results.",
  problem_admin: "Problem admin workspace is live. You can create problems and verify the admin APIs."
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
      {/* 1. 新增一個 header-container 把 hero-panel 和 session-strip 包在一起 */}
      <div className="header-container">
        <section className="hero-panel">
          <div className="hero-row">
            <div>
              <h1>Online Code Test</h1>
            </div>

            {/* <div className={`health-indicator health-${health.status}`}>
              <span className="health-dot" />
              <span>{health.message}</span>
            </div> */}
          </div>
        </section>

        {/* 2. 把 session-strip 移到這裡，並加上登入狀態判斷 */}
        {session && !sessionLoading && (
          <section className="session-strip">
            <div>
              {/* <p className="eyebrow">Current Session</p> */}
              <div className="session-heading">
                <h2>{session.user.name}</h2>
                <span className="role-badge">{session.user.role}</span>
                {/* <p className="session-copy">{roleCopy[session.user.role]}</p> */}

                <button className="secondary-button" onClick={handleLogout} type="button">
                  Log Out
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* 3. 下方的內容就單純區分 LoginPanel 或是 Workspace */}
      {!session || sessionLoading ? (
        <LoginPanel
          health={health}
          isLoading={loginLoading || sessionLoading}
          error={loginError}
          onLogin={handleLogin}
        />
      ) : (
        <>
          {session.user.role === "candidate" ? <CandidateWorkspace token={session.token} user={session.user} /> : null}
          {session.user.role === "interviewer" ? <InterviewerWorkspace token={session.token} /> : null}
          {session.user.role === "problem_admin" ? <ProblemAdminWorkspace token={session.token} /> : null}
        </>
      )}
    </main>
  );

}
