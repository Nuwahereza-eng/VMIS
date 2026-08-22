import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import {
  allVisitors,
  openVisits,
  recordEntry,
  recordExit,
} from "../data/repository.js";
import { computeValidity } from "../domain/tickets.js";
import PageHeader from "../components/PageHeader.jsx";

export default function VisitsPage() {
  const { session, refreshOutbox } = useApp();
  const [visitors, setVisitors] = useState([]);
  const [open, setOpen] = useState([]);
  const [form, setForm] = useState({ visitor_id: "", ticket_number: "", nights_purchased: 1 });
  const [error, setError] = useState(null);

  async function refresh() {
    setVisitors(await allVisitors());
    setOpen(await openVisits());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onEntry(e) {
    e.preventDefault();
    setError(null);
    if (!form.visitor_id) {
      setError("Choose a visitor.");
      return;
    }
    await recordEntry(
      {
        visitor_id: form.visitor_id,
        ticket_number: form.ticket_number,
        nights_purchased: Number(form.nights_purchased),
      },
      session.stationId,
    );
    await refreshOutbox();
    setForm({ visitor_id: "", ticket_number: "", nights_purchased: 1 });
    await refresh();
  }

  async function onExit(visitId) {
    await recordExit(visitId, {}, session.stationId);
    await refreshOutbox();
    await refresh();
  }

  const nameFor = (id) => visitors.find((v) => v.id === id)?.full_name || id;

  return (
    <>
      <PageHeader
        icon="bi-door-open"
        title="Entry and exit"
        subtitle="Record gate movements and track who is currently inside the park"
      />

      <div className="row g-4">
        <div className="col-lg-5">
          <form onSubmit={onEntry} className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-box-arrow-in-right" />
              <h2>Record entry</h2>
            </div>
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="mb-3">
              <label className="form-label">Visitor</label>
              <select
                className="form-select"
                value={form.visitor_id}
                onChange={(e) => setForm({ ...form, visitor_id: e.target.value })}
              >
                <option value="">Select a visitor…</option>
                {visitors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.full_name} ({v.id_number})
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Ticket number</label>
              <div className="input-icon">
                <i className="bi bi-ticket-perforated" />
                <input
                  className="form-control"
                  value={form.ticket_number}
                  onChange={(e) => setForm({ ...form, ticket_number: e.target.value })}
                  placeholder="Printed ticket reference"
                  required
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">Nights purchased</label>
              <div className="input-icon">
                <i className="bi bi-moon-stars" />
                <input
                  type="number"
                  min="1"
                  max="365"
                  className="form-control"
                  value={form.nights_purchased}
                  onChange={(e) => setForm({ ...form, nights_purchased: e.target.value })}
                  required
                />
              </div>
              <div className="form-text">
                Ticket expiry is entry time plus nights × 24 hours.
              </div>
            </div>
            <button className="btn btn-success">
              <i className="bi bi-check2-circle" /> Record entry
            </button>
          </form>
        </div>

        <div className="col-lg-7">
          <div className="surface-card p-4 h-100">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="card-title-row mb-0">
                <i className="bi bi-people" />
                <h2>Inside the park</h2>
              </div>
              <span className="pill active">{open.length} open</span>
            </div>

            {open.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-door-closed" />
                No open visits on this device.
              </div>
            ) : (
              <div>
                {open.map((v) => {
                  const t = computeValidity(v.entry_timestamp, v.nights_purchased);
                  const active = t.status === "Active";
                  return (
                    <div key={v.id} className="data-row">
                      <div className="d-flex align-items-center gap-3">
                        <div className="data-row__avatar">
                          {nameFor(v.visitor_id)?.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                            {nameFor(v.visitor_id)}
                          </div>
                          <div className="muted" style={{ fontSize: "0.82rem" }}>
                            <i className="bi bi-ticket-perforated me-1" />
                            {v.ticket_number} · gate {v.entry_gate}
                          </div>
                        </div>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className={"pill " + (active ? "active" : "expired")}>
                          <i className={"bi " + (active ? "bi-check-circle" : "bi-x-circle")} />
                          {t.status}
                        </span>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => onExit(v.id)}
                        >
                          <i className="bi bi-box-arrow-right" /> Exit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
