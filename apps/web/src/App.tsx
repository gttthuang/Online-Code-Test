import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthUser, CandidateExamSummary } from "@oct/contracts";
import { Activity, ClipboardList, Code2, Database, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, PlusCircle, UserRoundCog } from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { getCandidateExam, getMe, loginWithEmail, startCandidateExam } from "./lib/api";
import { clearStoredSession, loadStoredSession, saveStoredSession } from "./lib/session";
import { CandidateWorkspace } from "./views/CandidateWorkspace";
import { InterviewerWorkspace } from "./views/InterviewerWorkspace";
import { LoginPanel } from "./views/LoginPanel";
import { ProblemAdminWorkspace } from "./views/ProblemAdminWorkspace";

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
  problem_admin: "Admin"
} satisfies Record<AuthUser["role"], string>;

const roleDisplayName = {
  candidate: "Candidate",
  interviewer: "Interviewer",
  problem_admin: "Admin"
} satisfies Record<AuthUser["role"], string>;

const workspaceNav = {
  candidate: [
    { label: "Exam", path: "/candidate", icon: Code2 },
    { label: "Assignments", path: "/candidate/assignments", icon: ClipboardList }
  ],
  interviewer: [
    { label: "Dashboard", path: "/interviewer", icon: LayoutDashboard },
    { label: "Candidates", path: "/interviewer/candidates", icon: UserRoundCog },
    { label: "Assign", path: "/interviewer/assign", icon: ClipboardList },
    { label: "Results", path: "/interviewer/results", icon: Activity }
  ],
  problem_admin: [
    // { label: "Dashboard", path: "/problem-admin", icon: LayoutDashboard },
    { label: "New Problem", path: "/problem-admin/new", icon: PlusCircle },
    { label: "Problems", path: "/problem-admin/problems", icon: Database },
    { label: "Submissions", path: "/problem-admin/submissions", icon: Activity },
    { label: "Users", path: "/problem-admin/users", icon: UserRoundCog }
  ]
} satisfies Record<AuthUser["role"], Array<{ label: string; path: string; icon: typeof LayoutDashboard }>>;

function CandidateRoute({ session }: { readonly session: SessionState }) {
  const { problemId } = useParams();

  return <CandidateWorkspace initialProblemId={problemId ?? null} token={session.token} user={session.user} />;
}

function CandidateAssignmentsPage({ session }: { readonly session: SessionState }) {
  const [exam, setExam] = useState<CandidateExamSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getCandidateExam(session.token)
      .then((nextExam) => {
        if (!cancelled) {
          setExam(nextExam);
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

  async function handleStartExam() {
    setStarting(true);
    setError(null);

    try {
      const response = await startCandidateExam(session.token);
      setExam(response.exam);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to start exam");
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="workspace-container dashboard-page">
      <header className="workspace-header">
        <p className="eyebrow">Candidate Workspace</p>
        <h1>Exam</h1>
        <p className="subtitle text-muted">Start the exam to unlock assigned problems and the timer.</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="assignment-card-list">
        <CandidateAssignmentsList exam={exam} loading={loading} onStartExam={handleStartExam} starting={starting} />
      </div>
    </section>
  );
}

function CandidateAssignmentsList({
  exam,
  loading,
  onStartExam,
  starting
}: Readonly<{
  exam: CandidateExamSummary | null;
  loading: boolean;
  onStartExam: () => void;
  starting: boolean;
}>) {
  if (loading) {
    return <div className="empty-state">Loading assignments...</div>;
  }

  if (!exam || exam.assignmentCount === 0) {
    return <div className="empty-state">No assignments yet.</div>;
  }

  if (exam.status === "not_started") {
    return (
      <article className="status-card exam-start-card">
        <p className="eyebrow">Ready</p>
        <h2>{exam.assignmentCount} assigned problem{exam.assignmentCount === 1 ? "" : "s"}</h2>
        <p className="panel-copy">Time limit: {formatExamDuration(exam.durationMinutes)}</p>
        <button className="primary-button" disabled={starting} onClick={onStartExam} type="button">
          {starting ? "Starting..." : "Start Exam"}
        </button>
      </article>
    );
  }

  if (exam.status === "expired") {
    return (
      <article className="status-card exam-start-card">
        <p className="eyebrow">Expired</p>
        <h2>Time limit reached</h2>
        <p className="panel-copy">The assigned exam window has ended.</p>
      </article>
    );
  }

  const assignments = exam.assignments ?? [];

  return (
    <>
      <article className="status-card exam-start-card">
        <p className="eyebrow">In Progress</p>
        <h2>{formatRemainingTime(exam.remainingSeconds)} remaining</h2>
        <p className="panel-copy">{exam.assignmentCount} assigned problem{exam.assignmentCount === 1 ? "" : "s"}</p>
      </article>
      {assignments.map((assignment) => (
        <Link className="assignment-card-link" key={assignment.id} to={`/candidate/problems/${assignment.problemId}`}>
          <div>
            <strong>{assignment.problemTitle}</strong>
          </div>
          <span className="role-badge">{assignment.difficulty}</span>
        </Link>
      ))}
    </>
  );
}

function formatExamDuration(durationMinutes: number | null) {
  if (!durationMinutes) {
    return "Not set";
  }

  return `${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}`;
}

function formatRemainingTime(remainingSeconds: number | null) {
  if (remainingSeconds === null) {
    return "--:--";
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AppRoutes() {
  const storedSession = useMemo(() => loadStoredSession(), []);
  const [session, setSession] = useState<SessionState | null>(storedSession);
  const [sessionLoading, setSessionLoading] = useState(Boolean(storedSession));
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const navigate = useNavigate();

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
            <LoginPage error={loginError} isLoading={loginLoading} onLogin={handleLogin} />
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
            {session ? <ProblemAdminWorkspace currentUserId={session.user.id} token={session.token} /> : null}
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
  isLoading,
  onLogin
}: {
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly onLogin: (email: string) => Promise<void>;
}) {
  return (
    <main className="app-shell login-shell">
      <LoginPanel error={error} isLoading={isLoading} onLogin={onLogin} />
    </main>
  );
}

function ProtectedWorkspace({
  children,
  expectedRole,
  onLogout,
  session
}: {
  readonly children: ReactNode;
  readonly expectedRole: AuthUser["role"];
  readonly onLogout: () => void;
  readonly session: SessionState | null;
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

function WorkspaceFrame({ children, onLogout, session }: { readonly children: ReactNode; readonly onLogout: () => void; readonly session: SessionState }) {
  const location = useLocation();
  const navItems = workspaceNav[session.user.role];
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <main className={sidebarOpen ? "app-shell routed-app-shell" : "app-shell routed-app-shell routed-app-shell-no-sidebar"}>
      {sidebarOpen ? (
        <aside className="app-sidebar">
          <div className="sidebar-head">
            <div className="brand-lockup">
              <div className="brand-mark">OCT</div>
              <div>
                <strong>Online Code Test</strong>
                <span>{workspaceCopy[session.user.role]}</span>
              </div>
            </div>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(false)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              type="button"
            >
              <PanelLeftClose aria-hidden="true" size={18} />
            </button>
          </div>

          <nav className="sidebar-nav" aria-label="Workspace navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                (item.path !== roleHomePath[session.user.role] && location.pathname.startsWith(item.path));

              return (
                <NavLink
                  className={isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                  key={item.path}
                  onClick={(event) => {
                    // Clicking "Exam" while already viewing a specific problem would
                    // reset to the default problem; keep the candidate where they are.
                    if (item.path === roleHomePath.candidate && location.pathname.startsWith("/candidate/problems")) {
                      event.preventDefault();
                    }
                  }}
                  to={item.path}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>
      ) : (
        <button
          className="sidebar-expand"
          onClick={() => setSidebarOpen(true)}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          type="button"
        >
          <PanelLeftOpen aria-hidden="true" size={18} />
        </button>
      )}

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
            <span className="role-badge">{roleDisplayName[session.user.role]}</span>
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
