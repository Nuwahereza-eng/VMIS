import { useCallback, useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { createUser, getUsers } from "../api/client.js";
import PageHeader from "../components/PageHeader.jsx";

const ROLES = [
  { value: "gate_officer", label: "Gate officer" },
  { value: "activity_officer", label: "Activity officer" },
  { value: "management", label: "Management" },
];
const ROLE_LABELS = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

function emptyForm() {
  return {
    username: "",
    password: "",
    full_name: "",
    role: "gate_officer",
    station_id: "",
  };
}

export default function UsersPage() {
  const { session, online } = useApp();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setUsers(await getUsers(session.token));
    } catch {
      setError("Could not load users. This needs a live connection to the central system.");
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    if (online) load();
    else setLoading(false);
  }, [online, load]);

  async function onSubmit(e) {
    e.preventDefault();
    setNote(null);
    setError(null);
    if (form.username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await createUser(session.token, {
        username: form.username.trim(),
        password: form.password,
        full_name: form.full_name.trim() || null,
        role: form.role,
        station_id: form.station_id.trim() || null,
      });
      setForm(emptyForm());
      setNote({ type: "success", text: "User created." });
      await load();
    } catch (err) {
      setError(err?.message || "Could not create the user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        icon="bi-person-badge"
        title="Users"
        subtitle="Manage officer and management accounts"
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={!online || loading}>
            <i className={"bi bi-arrow-repeat" + (loading ? " spin" : "")} /> Refresh
          </button>
        }
      />

      {!online && (
        <div className="alert alert-warning">
          User management needs a live connection and is unavailable offline.
        </div>
      )}

      <div className="row g-4">
        <div className="col-lg-5">
          <form onSubmit={onSubmit} className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-person-plus" />
              <h2>Add user</h2>
            </div>
            {note && <div className={`alert alert-${note.type}`}>{note.text}</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="mb-3">
              <label className="form-label">Username</label>
              <input
                className="form-control"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Full name</label>
              <input
                className="form-control"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Role</label>
              <select
                className="form-select"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Station ID</label>
              <input
                className="form-control"
                placeholder="e.g. tangi-gate"
                value={form.station_id}
                onChange={(e) => setForm({ ...form, station_id: e.target.value })}
              />
            </div>
            <button className="btn btn-success" disabled={!online || saving}>
              <i className="bi bi-check2-circle" /> {saving ? "Saving…" : "Create user"}
            </button>
          </form>
        </div>

        <div className="col-lg-7">
          <div className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-people" />
              <h2>Accounts {users.length > 0 && <span className="pill neutral ms-2">{users.length}</span>}</h2>
            </div>
            {loading ? (
              <div className="empty-state mb-0">
                <i className="bi bi-arrow-repeat spin" /> Loading…
              </div>
            ) : users.length === 0 ? (
              <div className="empty-state mb-0">
                <i className="bi bi-people" /> No users to show.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Station</th>
                      <th className="text-end">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          {u.username}
                          {u.full_name && (
                            <div className="muted" style={{ fontSize: "0.78rem" }}>
                              {u.full_name}
                            </div>
                          )}
                        </td>
                        <td>{ROLE_LABELS[u.role] || u.role}</td>
                        <td>{u.station_id || "Not assigned"}</td>
                        <td className="text-end">
                          <span className={"pill " + (u.is_active ? "green" : "expired")}>
                            {u.is_active ? "Active" : "Disabled"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
