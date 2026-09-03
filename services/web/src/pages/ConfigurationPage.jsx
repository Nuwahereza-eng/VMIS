import { useCallback, useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import {
  createActivity,
  createFacility,
  createGate,
  deleteActivity,
  deleteFacility,
  deleteGate,
  getActivities,
  getFacilities,
  getGates,
  setActivityRates,
  updateActivity,
  updateFacility,
  updateGate,
} from "../api/client.js";
import {
  CATEGORIES,
  CATEGORY_CURRENCY,
  CURRENCY_MINOR_EXPONENT,
  formatMinor,
} from "../domain/categories.js";

const TABS = [
  { key: "activities", label: "Activities & Prices", icon: "bi-binoculars" },
  { key: "gates", label: "Gates", icon: "bi-door-open" },
  { key: "facilities", label: "Facilities", icon: "bi-house-door" },
];

// Convert a major-unit text input (e.g. "35.00" USD, "25000" UGX) to integer
// minor units for the given currency. Blank/invalid becomes 0.
function toMinor(value, currency) {
  const exp = CURRENCY_MINOR_EXPONENT[currency] ?? 2;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10 ** exp);
}

// Integer minor units back to an editable major-unit string.
function toMajor(amountMinor, currency) {
  const exp = CURRENCY_MINOR_EXPONENT[currency] ?? 2;
  return (amountMinor / 10 ** exp).toString();
}

function emptyRateInputs() {
  return Object.fromEntries(CATEGORIES.map((c) => [c.code, ""]));
}

function emptyActivityForm() {
  return {
    code: "",
    name: "",
    is_free: false,
    is_active: true,
    rates: emptyRateInputs(),
  };
}

function ActivitiesConfig({ token, online }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyActivityForm());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  const isEditing = editingId !== null;

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setItems(await getActivities(token));
    } catch {
      setError("Could not load activities. This needs a live connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (online) load();
    else setLoading(false);
  }, [online, load]);

  function startEdit(a) {
    setEditingId(a.id);
    const rates = emptyRateInputs();
    for (const r of a.rates || []) {
      rates[r.category] = toMajor(r.amount_minor, r.currency);
    }
    setForm({
      code: a.code,
      name: a.name,
      is_free: a.is_free,
      is_active: a.is_active,
      rates,
    });
    setNote(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyActivityForm());
    setNote(null);
    setError(null);
  }

  function ratePayload() {
    return CATEGORIES.filter((c) => form.rates[c.code] !== "").map((c) => ({
      category: c.code,
      amount_minor: toMinor(form.rates[c.code], CATEGORY_CURRENCY[c.code]),
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setNote(null);
    setError(null);
    if (form.name.trim().length < 1) {
      setError("Name is required.");
      return;
    }
    if (!isEditing && form.code.trim().length < 1) {
      setError("Code is required.");
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        await updateActivity(token, editingId, {
          name: form.name.trim(),
          is_free: form.is_free,
          is_active: form.is_active,
        });
        await setActivityRates(token, editingId, form.is_free ? [] : ratePayload());
        setNote({ type: "success", text: "Activity updated." });
        setEditingId(null);
      } else {
        await createActivity(token, {
          code: form.code.trim(),
          name: form.name.trim(),
          is_free: form.is_free,
          is_active: form.is_active,
          rates: form.is_free ? [] : ratePayload(),
        });
        setNote({ type: "success", text: "Activity created." });
      }
      setForm(emptyActivityForm());
      await load();
    } catch (err) {
      setError(err?.message || "Could not save the activity.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(a) {
    if (!window.confirm(`Delete activity "${a.name}"? This cannot be undone.`)) return;
    setNote(null);
    setError(null);
    setDeletingId(a.id);
    try {
      await deleteActivity(token, a.id);
      if (editingId === a.id) cancelEdit();
      setNote({ type: "success", text: `Activity "${a.name}" deleted.` });
      await load();
    } catch (err) {
      setError(err?.message || "Could not delete the activity.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="row g-4">
      <div className="col-lg-5">
        <form onSubmit={onSubmit} className="surface-card p-4">
          <div className="card-title-row">
            <i className={"bi " + (isEditing ? "bi-pencil-square" : "bi-plus-circle")} />
            <h2>{isEditing ? "Edit activity" : "Add activity"}</h2>
          </div>
          {note && <div className={`alert alert-${note.type}`}>{note.text}</div>}
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="mb-3">
            <label className="form-label">Code</label>
            <input
              className="form-control"
              placeholder="e.g. day_game_drive"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={isEditing}
              autoComplete="off"
            />
            {isEditing && <div className="muted" style={{ fontSize: "0.78rem" }}>Code cannot be changed.</div>}
          </div>
          <div className="mb-3">
            <label className="form-label">Name</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-check form-switch mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="activity-free"
              checked={form.is_free}
              onChange={(e) => setForm({ ...form, is_free: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="activity-free">
              Free activity (no charge)
            </label>
          </div>
          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="activity-active"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="activity-active">
              Active (shown to officers)
            </label>
          </div>

          {!form.is_free && (
            <div className="mb-3">
              <label className="form-label">Prices by category</label>
              {CATEGORIES.map((c) => (
                <div className="input-group mb-2" key={c.code}>
                  <span className="input-group-text" style={{ minWidth: 130 }}>
                    {c.code} · {c.currency}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={CURRENCY_MINOR_EXPONENT[c.currency] === 0 ? "1" : "0.01"}
                    className="form-control"
                    placeholder="0"
                    value={form.rates[c.code]}
                    onChange={(e) =>
                      setForm({ ...form, rates: { ...form.rates, [c.code]: e.target.value } })
                    }
                  />
                </div>
              ))}
              <div className="muted" style={{ fontSize: "0.78rem" }}>
                Leave a category blank to offer no rate for it.
              </div>
            </div>
          )}

          <div className="d-flex gap-2">
            <button className="btn btn-success" disabled={!online || saving}>
              <i className="bi bi-check2-circle" />{" "}
              {saving ? "Saving…" : isEditing ? "Save changes" : "Create activity"}
            </button>
            {isEditing && (
              <button type="button" className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="col-lg-7">
        <div className="surface-card p-4">
          <div className="card-title-row">
            <i className="bi bi-list-ul" />
            <h2>
              Activities{" "}
              {items.length > 0 && <span className="pill neutral ms-2">{items.length}</span>}
            </h2>
          </div>
          {loading ? (
            <div className="empty-state mb-0">
              <i className="bi bi-arrow-repeat spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state mb-0">
              <i className="bi bi-binoculars" /> No activities yet.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Prices</th>
                    <th>Status</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className={editingId === a.id ? "table-active" : undefined}>
                      <td>
                        {a.name}
                        <div className="muted" style={{ fontSize: "0.78rem" }}>{a.code}</div>
                      </td>
                      <td>
                        {a.is_free ? (
                          <span className="pill green">Free</span>
                        ) : a.rates && a.rates.length ? (
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            {a.rates.map((r) => (
                              <div key={r.category}>
                                {r.category}: {formatMinor(r.amount_minor, r.currency)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="muted">No rates</span>
                        )}
                      </td>
                      <td>
                        <span className={"pill " + (a.is_active ? "green" : "expired")}>
                          {a.is_active ? "Active" : "Hidden"}
                        </span>
                      </td>
                      <td className="text-end text-nowrap">
                        <button
                          className="icon-btn icon-btn--sm"
                          title="Edit activity"
                          onClick={() => startEdit(a)}
                          disabled={!online}
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="icon-btn icon-btn--sm icon-btn--danger ms-1"
                          title="Delete activity"
                          onClick={() => onDelete(a)}
                          disabled={!online || deletingId === a.id}
                        >
                          <i className={"bi " + (deletingId === a.id ? "bi-arrow-repeat spin" : "bi-trash")} />
                        </button>
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
  );
}

function MasterListConfig({ token, online, noun, icon, api }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setItems(await api.list(token));
    } catch {
      setError(`Could not load ${noun}s. This needs a live connection.`);
    } finally {
      setLoading(false);
    }
  }, [token, api, noun]);

  useEffect(() => {
    if (online) load();
    else setLoading(false);
  }, [online, load]);

  async function onCreate(e) {
    e.preventDefault();
    setNote(null);
    setError(null);
    if (name.trim().length < 1) {
      setError(`${noun} name is required.`);
      return;
    }
    setSaving(true);
    try {
      await api.create(token, { name: name.trim(), is_active: true });
      setName("");
      setNote({ type: "success", text: `${noun} added.` });
      await load();
    } catch (err) {
      setError(err?.message || `Could not add the ${noun.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(item) {
    if (editName.trim().length < 1) {
      setError(`${noun} name is required.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.update(token, item.id, { name: editName.trim() });
      setEditingId(null);
      setNote({ type: "success", text: `${noun} updated.` });
      await load();
    } catch (err) {
      setError(err?.message || `Could not update the ${noun.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    setError(null);
    try {
      await api.update(token, item.id, { is_active: !item.is_active });
      await load();
    } catch (err) {
      setError(err?.message || `Could not update the ${noun.toLowerCase()}.`);
    }
  }

  async function onDelete(item) {
    if (!window.confirm(`Delete ${noun.toLowerCase()} "${item.name}"?`)) return;
    setNote(null);
    setError(null);
    setDeletingId(item.id);
    try {
      await api.remove(token, item.id);
      if (editingId === item.id) setEditingId(null);
      setNote({ type: "success", text: `${noun} "${item.name}" deleted.` });
      await load();
    } catch (err) {
      setError(err?.message || `Could not delete the ${noun.toLowerCase()}.`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="row g-4">
      <div className="col-lg-5">
        <form onSubmit={onCreate} className="surface-card p-4">
          <div className="card-title-row">
            <i className={"bi " + icon} />
            <h2>Add {noun.toLowerCase()}</h2>
          </div>
          {note && <div className={`alert alert-${note.type}`}>{note.text}</div>}
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="mb-3">
            <label className="form-label">{noun} name</label>
            <input
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button className="btn btn-success" disabled={!online || saving}>
            <i className="bi bi-check2-circle" /> {saving ? "Saving…" : `Add ${noun.toLowerCase()}`}
          </button>
        </form>
      </div>

      <div className="col-lg-7">
        <div className="surface-card p-4">
          <div className="card-title-row">
            <i className={"bi " + icon} />
            <h2>
              {noun}s{" "}
              {items.length > 0 && <span className="pill neutral ms-2">{items.length}</span>}
            </h2>
          </div>
          {loading ? (
            <div className="empty-state mb-0">
              <i className="bi bi-arrow-repeat spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state mb-0">
              <i className={"bi " + icon} /> No {noun.toLowerCase()}s yet.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>{noun}</th>
                    <th>Status</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={editingId === item.id ? "table-active" : undefined}>
                      <td>
                        {editingId === item.id ? (
                          <input
                            className="form-control form-control-sm"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        ) : (
                          item.name
                        )}
                      </td>
                      <td>
                        <span className={"pill " + (item.is_active ? "green" : "expired")}>
                          {item.is_active ? "Active" : "Hidden"}
                        </span>
                      </td>
                      <td className="text-end text-nowrap">
                        {editingId === item.id ? (
                          <>
                            <button
                              className="icon-btn icon-btn--sm"
                              title="Save"
                              onClick={() => saveEdit(item)}
                              disabled={!online || saving}
                            >
                              <i className="bi bi-check2" />
                            </button>
                            <button
                              className="icon-btn icon-btn--sm ms-1"
                              title="Cancel"
                              onClick={() => setEditingId(null)}
                              disabled={saving}
                            >
                              <i className="bi bi-x" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="icon-btn icon-btn--sm"
                              title={item.is_active ? "Hide from pickers" : "Activate"}
                              onClick={() => toggleActive(item)}
                              disabled={!online}
                            >
                              <i className={"bi " + (item.is_active ? "bi-eye-slash" : "bi-eye")} />
                            </button>
                            <button
                              className="icon-btn icon-btn--sm ms-1"
                              title={`Edit ${noun.toLowerCase()}`}
                              onClick={() => {
                                setEditingId(item.id);
                                setEditName(item.name);
                                setError(null);
                              }}
                              disabled={!online}
                            >
                              <i className="bi bi-pencil" />
                            </button>
                            <button
                              className="icon-btn icon-btn--sm icon-btn--danger ms-1"
                              title={`Delete ${noun.toLowerCase()}`}
                              onClick={() => onDelete(item)}
                              disabled={!online || deletingId === item.id}
                            >
                              <i className={"bi " + (deletingId === item.id ? "bi-arrow-repeat spin" : "bi-trash")} />
                            </button>
                          </>
                        )}
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
  );
}

const GATE_API = {
  list: getGates,
  create: createGate,
  update: updateGate,
  remove: deleteGate,
};

const FACILITY_API = {
  list: getFacilities,
  create: createFacility,
  update: updateFacility,
  remove: deleteFacility,
};

export default function ConfigurationPage() {
  const { session, online } = useApp();
  const [tab, setTab] = useState("activities");

  return (
    <>
      <PageHeader
        icon="bi-sliders"
        title="Configuration"
        subtitle="Manage activities, prices, gates, and accommodation facilities"
      />

      {!online && (
        <div className="alert alert-warning">
          Configuration needs a live connection to the central system and is unavailable offline.
        </div>
      )}

      <ul className="nav nav-pills gap-2 mb-4">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              className={"nav-link" + (tab === t.key ? " active" : "")}
              onClick={() => setTab(t.key)}
            >
              <i className={"bi " + t.icon} /> {t.label}
            </button>
          </li>
        ))}
      </ul>

      {tab === "activities" && <ActivitiesConfig token={session.token} online={online} />}
      {tab === "gates" && (
        <MasterListConfig
          token={session.token}
          online={online}
          noun="Gate"
          icon="bi-door-open"
          api={GATE_API}
        />
      )}
      {tab === "facilities" && (
        <MasterListConfig
          token={session.token}
          online={online}
          noun="Facility"
          icon="bi-house-door"
          api={FACILITY_API}
        />
      )}
    </>
  );
}
