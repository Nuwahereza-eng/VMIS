import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import {
  allVisitors,
  openVisits,
  recordEntry,
  recordExit,
} from "../data/repository.js";
import { computeValidity } from "../domain/tickets.js";

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
    <div className="row">
      <div className="col-lg-5">
        <h2 className="h4 mb-3">Record entry</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={onEntry} className="card card-body shadow-sm">
          <div className="mb-3">
            <label className="form-label">Visitor</label>
            <select
              className="form-select"
              value={form.visitor_id}
              onChange={(e) => setForm({ ...form, visitor_id: e.target.value })}
            >
              <option value="">Select...</option>
              {visitors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.full_name} ({v.id_number})
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Ticket number</label>
            <input
              className="form-control"
              value={form.ticket_number}
              onChange={(e) => setForm({ ...form, ticket_number: e.target.value })}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Nights purchased</label>
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
          <button className="btn btn-success">Record entry</button>
        </form>
      </div>

      <div className="col-lg-7">
        <h2 className="h4 mb-3">Inside the park</h2>
        {open.length === 0 && <p className="text-muted">No open visits on this device.</p>}
        <div className="list-group">
          {open.map((v) => {
            const t = computeValidity(v.entry_timestamp, v.nights_purchased);
            return (
              <div key={v.id} className="list-group-item">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-semibold">{nameFor(v.visitor_id)}</div>
                    <div className="small text-muted">
                      Ticket {v.ticket_number} - gate {v.entry_gate} -{" "}
                      <span className={t.status === "Active" ? "text-success" : "text-danger"}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => onExit(v.id)}>
                    Record exit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
