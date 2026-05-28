import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthUser } from "@oct/contracts";
import { Activity, ClipboardList, Code2, Database, LayoutDashboard, LogOut, PlusCircle, UserRoundCog } from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { getAssignments, getHealth, getMe, loginWithEmail } from "./lib/api";
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

const roleHomePath = {
  candidate: "/candidate",
  interviewer: "/interviewer",
  problem_admin: "/problem-admin"
} satisfies Record<AuthUser["role"], string>;

const workspaceCopy = {
  candidate: "Candidate Exam",
  interviewer: "Interviewer Console",
  problem_admin: "Problem Admin"
} satisfies Record<AuthUser["role"], string>;

const workspaceNav = {
  candidate: [
    { label: "Exam", path: "/candidate", icon: Code2 },
    { label: "Assignments", path: "/candidate/assignments", icon: ClipboardList }
  ],
  interviewer: [
    { label: "Dashboard", path: "/interviewer", icon: LayoutDashboard },
    { label: "Candidates", path: "/interviewer/candidates", icon: UserRoundCog },
    { label: "Results", path: "/interviewer/results", icon: Activity }
  ],
  problem_admin: [
    { label: "Dashboard", path: "/problem-admin", icon: LayoutDashboard },
    { label: "New Problem", path: "/problem-admin/new", icon: PlusCircle },
    { label: "Problems", path: "/problem-admin/problems", icon: Database }
  ]
} satisfies Record<AuthUser["role"], Array<{ label: string; path: string; icon: typeof LayoutDashboard }>>;

function CandidateRoute({ session }: { session: SessionState }) {
  const { problemId } = useParams();

  return <CandidateWorkspace initialProblemId={problemId ?? null} token={session.token} user={session.user} />;
}

function CandidateAssignmentsPage({ session }: { session: SessionState }) {
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof getAssignments>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getAssignments(session.token)
      .then((items) => {
        if (!cancelled) {
          setAssignments(items);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load assignments");
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
  }, [session.token]);

  return (
    <section className="workspace-container dashboard-page">
      <header className="workspace-header">
        <p className="eyebrow">Candidate Workspace</p>
        <h1>Assignments</h1>
        <p className="subtitle text-muted">Open an assigned problem to start coding.</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="assignment-card-list">
        {loading ? (
          <div className="empty-state">Loading assignments...</div>
        ) : assignments.length === 0 ? (
          <div className="empty-state">No assignments yet.</div>
        ) : (
          assignments.map((assignment) => (
            <Link className="assignment-card-link" key={assignment.id} to={`/candidate/problems/${assignment.problemId}`}>
              <div>
                <strong>{assignment.problemTitle}</strong>
                <small>{assignment.problemId}</small>
              </div>
              <span className="role-badge">{assignment.difficulty}</span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function AppRoutes() {
  const storedSession = useMemo(() => loadStoredSession(), []);
  const [health, setHealth] = useState<HealthState>({
    status: "idle",
    message: "Checking API status..."
  });
  const [session, setSession] = useState<SessionState | null>(storedSession);
  const [sessionLoading, setSessionLoading] = useState(Boolean(storedSession));
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then(() => {
        if (!cancelled) {
          setHealth({
            status: "ready",
            message: "API is reachable on localhost:3000"
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth({
            status: "error",
            message: "Cannot reach API. Start backend with npm run dev:api"
          });
        }
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
        if (!cancelled) {
          clearStoredSession();
          setSession(null);
        }
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
      navigate(roleHomePath[response.user.role], { replace: true });
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
    navigate("/login", { replace: true });
  }

  if (sessionLoading) {
    return (
      <main className="app-shell route-shell">
        <div className="route-loading">Loading session...</div>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        element={
          session ? (
            <Navigate replace to={roleHomePath[session.user.role]} />
          ) : (
            <LoginPage error={loginError} health={health} isLoading={loginLoading} onLogin={handleLogin} />
          )
        }
        path="/login"
      />

      <Route
        element={
          <ProtectedWorkspace expectedRole="candidate" onLogout={handleLogout} session={session}>
            {session ? <CandidateRoute session={session} /> : null}
          </ProtectedWorkspace>
        }
        path="/candidate"
      />
      <Route
        element={
          <ProtectedWorkspace expectedRole="candidate" onLogout={handleLogout} session={session}>
            {session ? <CandidateAssignmentsPage session={session} /> : null}
          </ProtectedWorkspace>
        }
        path="/candidate/assignments"
      />
      <Route
        element={
          <ProtectedWorkspace expectedRole="candidate" onLogout={handleLogout} session={session}>
            {session ? <CandidateRoute session={session} /> : null}
          </ProtectedWorkspace>
        }
        path="/candidate/problems/:problemId"
      />

      <Route
        element={
          <ProtectedWorkspace expectedRole="interviewer" onLogout={handleLogout} session={session}>
            {session ? <InterviewerWorkspace token={session.token} /> : null}
          </ProtectedWorkspace>
        }
        path="/interviewer/*"
      />

      <Route
        element={
          <ProtectedWorkspace expectedRole="problem_admin" onLogout={handleLogout} session={session}>
            {session ? <ProblemAdminWorkspace token={session.token} /> : null}
          </ProtectedWorkspace>
        }
        path="/problem-admin/*"
      />

      <Route
        element={<Navigate replace to={session ? roleHomePath[session.user.role] : "/login"} />}
        path="*"
      />
    </Routes>
  );
}

function LoginPage({
  error,
  health,
  isLoading,
  onLogin
}: {
  error: string | null;
  health: HealthState;
  isLoading: boolean;
  onLogin: (email: string) => Promise<void>;
}) {
  return (
    <main className="app-shell login-shell">
      <LoginPanel error={error} health={health} isLoading={isLoading} onLogin={onLogin} />
    </main>
  );
}

function ProtectedWorkspace({
  children,
  expectedRole,
  onLogout,
  session
}: {
  children: ReactNode;
  expectedRole: AuthUser["role"];
  onLogout: () => void;
  session: SessionState | null;
}) {
  if (!session) {
    return <Navigate replace to="/login" />;
  }

  if (session.user.role !== expectedRole) {
    return <Navigate replace to={roleHomePath[session.user.role]} />;
  }

  return (
    <WorkspaceFrame onLogout={onLogout} session={session}>
      {children}
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({ children, onLogout, session }: { children: ReactNode; onLogout: () => void; session: SessionState }) {
  const location = useLocation();
  const navItems = workspaceNav[session.user.role];

  return (
    <main className="app-shell routed-app-shell">
      <aside className="app-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">OCT</div>
          <div>
            <strong>Online Code Test</strong>
            <span>{workspaceCopy[session.user.role]}</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path !== roleHomePath[session.user.role] && location.pathname.startsWith(item.path));

            return (
              <NavLink className={isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"} key={item.path} to={item.path}>
                <Icon aria-hidden="true" size={17} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <section className="app-main-region">
        <header className="app-topbar">
          <div>
            <p className="eyebrow">Current Session</p>
            <h1>{workspaceCopy[session.user.role]}</h1>
          </div>
          <div className="session-heading">
            <div className="session-user">
              <strong>{session.user.name}</strong>
              <span>{session.user.email}</span>
            </div>
            <span className="role-badge">{session.user.role}</span>
            <button className="secondary-button icon-button-text" onClick={onLogout} type="button">
              <LogOut aria-hidden="true" size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </header>

        <div className="app-route-content">{children}</div>
      </section>
    </main>
  );
}

export function App() {
  return <AppRoutes />;
}
