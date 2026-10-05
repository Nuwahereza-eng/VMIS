import { useCallback, useEffect, useMemo, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import {
  createBooking,
  deleteBooking,
  getBookings,
  updateBooking,
} from "../api/client.js";
import { CATEGORIES } from "../domain/categories.js";
import { GATES, LODGES } from "../domain/reference.js";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

const STATUS_META = {
  pending: { label: "Expected", cls: "active", icon: "bi-hourglass-split" },
  arrived: { label: "Arrived", cls: "neutral", icon: "bi-box-arrow-in-right" },
  cancelled: { label: "Cancelled", cls: "neutral", icon: "bi-x-circle" },
  no_show: { label: "No show", cls: "expired", icon: "bi-dash-circle" },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    full_name: "",
    intended_date: todayISO(),
    country: "",
    phone: "",
    email: "",
    tour_company: "",
    category: "",
    party_size: 1,
    expected_gate: "",
    length_of_stay_nights: 1,
    accommodation: "",
    notes: "",
  };
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function BookingsPage() {
  const { session, online } = useApp();
  const token = session.token;

  const [form, setForm] = useState(emptyForm());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Filters: default to everything from today forward.
  const [filterFrom, setFilterFrom] = useState(todayISO());
  const [filterStatus, setFilterStatus] = useState("");

  const isManagement = session.role === "management";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getBookings(token, {
        dateFrom: filterFrom || undefined,
        status: filterStatus || undefined,
      });
      setBookings(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err?.message || "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, [token, filterFrom, filterStatus]);

  useEffect(() => {
    if (online) load();
    else setLoading(false);
  }, [online, load]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setNote(null);
    setError(null);
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        intended_date: form.intended_date,
        country: form.country.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        tour_company: form.tour_company.trim() || null,
        category: form.category || null,
        party_size: Number(form.party_size) || 1,
        expected_gate: form.expected_gate || null,
        length_of_stay_nights: Number(form.length_of_stay_nights) || 1,
        accommodation: form.accommodation || null,
        notes: form.notes.trim() || null,
      };
      await createBooking(token, payload);
      setForm(emptyForm());
      setNote("Pre-booking captured.");
      await load();
    } catch (err) {
      setError(err?.message || "Could not save the booking.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(booking, status) {
    setBusyId(booking.id);
    setError(null);
    try {
      await updateBooking(token, booking.id, { status });
      await load();
    } catch (err) {
      setError(err?.message || "Could not update the booking.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(booking) {
    setBusyId(booking.id);
    setError(null);
    try {
      await deleteBooking(token, booking.id);
      await load();
    } catch (err) {
      setError(err?.message || "Could not delete the booking.");
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(() => {
    const byDate = new Map();
    for (const b of bookings) {
      if (!byDate.has(b.intended_date)) byDate.set(b.intended_date, []);
      byDate.get(b.intended_date).push(b);
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [bookings]);

  const expectedCount = bookings.filter((b) => b.status === "pending").length;

  return (
    <>
      <PageHeader
        icon="bi-calendar-check"
        title="Pre-bookings"
        subtitle="Capture expressions of interest and see who is expected each day"
      />

      {!online && (
        <div className="alert alert-warning">
          Pre-bookings need a live connection to the central system and are unavailable offline.
        </div>
      )}

      <div className="row g-4">
        {/* Capture form */}
        <div className="col-lg-5">
          <div className="surface-card p-4">
            <h3 className="vp__card-title">NEW PRE-BOOKING</h3>
            {note && <div className="alert alert-success py-2">{note}</div>}
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <form onSubmit={onSubmit} className="d-flex flex-column gap-3">
              <div>
                <label className="form-label">Lead visitor / party name</label>
                <input
                  className="form-control"
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  required
                  maxLength={128}
                />
              </div>
              <div className="row g-2">
                <div className="col-7">
                  <label className="form-label">Intended date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.intended_date}
                    onChange={(e) => set("intended_date", e.target.value)}
                    required
                  />
                </div>
                <div className="col-5">
                  <label className="form-label">Party size</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    className="form-control"
                    value={form.party_size}
                    onChange={(e) => set("party_size", e.target.value)}
                  />
                </div>
              </div>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label">Country of origin</label>
                  <input
                    className="form-control"
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    maxLength={64}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                  >
                    <option value="">Not sure yet</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row g-2">
                <div className="col-7">
                  <label className="form-label">Expected entry gate</label>
                  <select
                    className="form-select"
                    value={form.expected_gate}
                    onChange={(e) => set("expected_gate", e.target.value)}
                  >
                    <option value="">Undecided</option>
                    {GATES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-5">
                  <label className="form-label">Nights</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="form-control"
                    value={form.length_of_stay_nights}
                    onChange={(e) => set("length_of_stay_nights", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">Accommodation</label>
                <select
                  className="form-select"
                  value={form.accommodation}
                  onChange={(e) => set("accommodation", e.target.value)}
                >
                  <option value="">Undecided</option>
                  {LODGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label">Phone</label>
                  <input
                    className="form-control"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    maxLength={32}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    maxLength={128}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">Tour operator</label>
                <input
                  className="form-control"
                  value={form.tour_company}
                  onChange={(e) => set("tour_company", e.target.value)}
                  maxLength={128}
                />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  maxLength={500}
                />
              </div>
              <button className="btn btn-success" disabled={!online || saving}>
                <i className={"bi " + (saving ? "bi-arrow-repeat spin" : "bi-calendar-plus")} />{" "}
                {saving ? "Saving…" : "Capture pre-booking"}
              </button>
            </form>
          </div>
        </div>

        {/* Expected list */}
        <div className="col-lg-7">
          <div className="surface-card p-4">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
              <h3 className="vp__card-title mb-0">
                EXPECTED VISITORS
                {expectedCount > 0 && (
                  <span className="pill active ms-2">
                    <i className="bi bi-people-fill" /> {expectedCount} expected
                  </span>
                )}
              </h3>
              <div className="d-flex align-items-center gap-2">
                <input
                  type="date"
                  className="form-control form-control-sm"
                  style={{ width: "auto" }}
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  aria-label="From date"
                />
                <select
                  className="form-select form-select-sm"
                  style={{ width: "auto" }}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  aria-label="Status filter"
                >
                  <option value="">All statuses</option>
                  <option value="pending">Expected</option>
                  <option value="arrived">Arrived</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No show</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="empty-state mb-0">
                <i className="bi bi-arrow-repeat spin" /> Loading…
              </div>
            ) : grouped.length === 0 ? (
              <div className="empty-state mb-0">
                <i className="bi bi-calendar-x" /> No pre-bookings match this filter.
              </div>
            ) : (
              grouped.map(([day, rows]) => (
                <div key={day} className="mb-4">
                  <div className="fw-semibold mb-2" style={{ color: "var(--vmis-green-700)" }}>
                    <i className="bi bi-calendar-event" /> {formatDate(day)}
                    <span className="muted ms-2" style={{ fontSize: "0.82rem" }}>
                      {rows.length} booking{rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {rows.map((b) => {
                      const meta = STATUS_META[b.status] || STATUS_META.pending;
                      return (
                        <div key={b.id} className="booking-row">
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center gap-2">
                              <span className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                                {b.full_name}
                              </span>
                              <span className={"pill " + meta.cls}>
                                <i className={"bi " + meta.icon} /> {meta.label}
                              </span>
                            </div>
                            <div className="muted" style={{ fontSize: "0.84rem" }}>
                              <i className="bi bi-people" /> {b.party_size}
                              {b.country ? ` · ${b.country}` : ""}
                              {b.category ? ` · ${CATEGORY_LABEL[b.category] || b.category}` : ""}
                              {b.expected_gate ? ` · ${b.expected_gate}` : ""}
                              {b.length_of_stay_nights
                                ? ` · ${b.length_of_stay_nights} night${b.length_of_stay_nights === 1 ? "" : "s"}`
                                : ""}
                              {b.accommodation ? ` · ${b.accommodation}` : ""}
                            </div>
                            {b.notes && (
                              <div className="muted" style={{ fontSize: "0.82rem" }}>
                                <i className="bi bi-sticky" /> {b.notes}
                              </div>
                            )}
                          </div>
                          <div className="d-flex align-items-center gap-1">
                            {b.status === "pending" && (
                              <>
                                <button
                                  className="icon-btn icon-btn--sm"
                                  title="Mark cancelled"
                                  disabled={!online || busyId === b.id}
                                  onClick={() => setStatus(b, "cancelled")}
                                >
                                  <i className="bi bi-x-circle" />
                                </button>
                                <button
                                  className="icon-btn icon-btn--sm"
                                  title="Mark no-show"
                                  disabled={!online || busyId === b.id}
                                  onClick={() => setStatus(b, "no_show")}
                                >
                                  <i className="bi bi-dash-circle" />
                                </button>
                              </>
                            )}
                            {b.status !== "pending" && b.status !== "arrived" && (
                              <button
                                className="icon-btn icon-btn--sm"
                                title="Reopen as expected"
                                disabled={!online || busyId === b.id}
                                onClick={() => setStatus(b, "pending")}
                              >
                                <i className="bi bi-arrow-counterclockwise" />
                              </button>
                            )}
                            {isManagement && (
                              <button
                                className="icon-btn icon-btn--sm icon-btn--danger"
                                title="Delete booking"
                                disabled={!online || busyId === b.id}
                                onClick={() => onDelete(b)}
                              >
                                <i className="bi bi-trash" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
