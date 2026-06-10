import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { AuthUser, UserRole } from "@oct/contracts";
import { roles } from "@oct/contracts";

import { createUser, deleteUser, getUsers, resetUserPassword } from "../../lib/api";

const roleLabels = {
  candidate: "Candidate",
  interviewer: "Interviewer",
  problem_admin: "Problem Admin"
} satisfies Record<UserRole, string>;

type Notice = {
  type: "success" | "error";
  title: string;
  message: string;
  /** Newly generated login credentials, shown once right after creation. */
  credentials?: {
    email: string;
    password: string;
  };
};

function compareUsers(left: AuthUser, right: AuthUser) {
  return `${left.role}:${left.name}:${left.email}`.localeCompare(`${right.role}:${right.name}:${right.email}`);
}

export function UserManager({
  currentUserId,
  token
}: {
  readonly currentUserId: string;
  readonly token: string;
}) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("candidate");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getUsers(token)
      .then((items) => {
        if (!cancelled) {
          setUsers(items);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          const message = nextError instanceof Error ? nextError.message : "Failed to load users";
          setError(message);
          setNotice({
            type: "error",
            title: "Users not loaded",
            message
          });
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
  }, [token]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const response = await createUser(token, {
        name: name.trim(),
        email: email.trim(),
        role
      });

      setUsers((current) => [...current, response.user].sort(compareUsers));
      setName("");
      setEmail("");
      setRole("candidate");
      setNotice({
        type: "success",
        title: "User created",
        message: `${response.user.name} can now sign in as ${roleLabels[response.user.role]}. Share these credentials — the password is shown only once.`,
        credentials: {
          email: response.user.email,
          password: response.password
        }
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to create user";
      setError(message);
      setNotice({
        type: "error",
        title: "User not created",
        message
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(user: AuthUser) {
    setResettingId(user.id);
    setError(null);

    try {
      const response = await resetUserPassword(token, user.id);
      setNotice({
        type: "success",
        title: "Password reset",
        message: `${user.name}'s password was regenerated. Share these credentials — it is shown only once.`,
        credentials: {
          email: user.email,
          password: response.password
        }
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to reset password";
      setError(message);
      setNotice({
        type: "error",
        title: "Password not reset",
        message
      });
    } finally {
      setResettingId(null);
    }
  }

  async function handleDeleteUser(user: AuthUser) {
    setDeletingId(user.id);
    setError(null);

    try {
      await deleteUser(token, user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setNotice({
        type: "success",
        title: "User deleted",
        message: `${user.name} was removed.`
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Failed to delete user";
      setError(message);
      setNotice({
        type: "error",
        title: "User not deleted",
        message
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <article className="status-card panel-column">
      <div className="panel-header">
        <div>
          <p className="eyebrow">User Management</p>
          <h2>Accounts and roles</h2>
        </div>
      </div>

      <div className="user-management-grid">
        <form className="stack-form admin-user-form" onSubmit={handleCreateUser}>
          <label className="field">
            <span>Name</span>
            <input onChange={(event) => setName(event.target.value)} placeholder="name" value={name} />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Role</span>
            <select onChange={(event) => setRole(event.target.value as UserRole)} value={role}>
              {roles.map((item) => (
                <option key={item} value={item}>
                  {roleLabels[item]}
                </option>
              ))}
            </select>
          </label>

          <button className="primary-button" disabled={creating || !name.trim() || !email.trim()} type="submit">
            {creating ? "Creating..." : "Create User"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}
        </form>

        <div className="result-table user-table">
          {loading && (
            <div className="empty-state">Loading users...</div>
          )}
          {!loading && users.length === 0 && (
            <div className="empty-state">No users yet.</div>
          )}
          {!loading && users.length > 0 && (
            users.map((user) => (
              <div className="user-table-row" key={user.id}>
                <div className="candidate-info">
                  <strong className="candidate-name">{user.name}</strong>
                  <span className="candidate-email">{user.email}</span>
                </div>

                <span className="badge badge-outline">{roleLabels[user.role]}</span>

                <button
                  className="secondary-button"
                  disabled={resettingId === user.id}
                  onClick={() => handleResetPassword(user)}
                  title="Generate a new password for this account"
                  type="button"
                >
                  {resettingId === user.id ? "Resetting..." : "Reset password"}
                </button>

                <button
                  className="delete-button"
                  disabled={user.id === currentUserId || deletingId === user.id}
                  onClick={() => handleDeleteUser(user)}
                  title={user.id === currentUserId ? "You cannot delete the account currently signed in." : "Delete user"}
                  type="button"
                >
                  {deletingId === user.id ? "..." : "x"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {notice ? (
        <output className={`toast floating-toast toast-${notice.type}`}>
          <strong>{notice.title}</strong>
          <span>{notice.message}</span>
          {notice.credentials ? (
            <dl className="credential-readout">
              <div>
                <dt>Email</dt>
                <dd>{notice.credentials.email}</dd>
              </div>
              <div>
                <dt>Password</dt>
                <dd><code>{notice.credentials.password}</code></dd>
              </div>
            </dl>
          ) : null}
          <button className="toast-close-button" onClick={() => setNotice(null)} type="button">
            x
          </button>
        </output>
      ) : null}
    </article>
  );
}
