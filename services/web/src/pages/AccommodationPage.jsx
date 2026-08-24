import { useEffect, useMemo, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { LODGES } from "../domain/reference.js";
import { visitorCode } from "../domain/ids.js";
import {
  allAccommodations,
  allVisitors,
  recordAccommodation,
} from "../data/repository.js";
import PageHeader from "../components/PageHeader.jsx";

export default function AccommodationPage() {
  const { refreshOutbox } = useApp();
  const [visitors, setVisitors] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ visitor_id: "", facility: LODGES[0], nights: 1 });
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setVisitors(await allVisitors());
    setRows(await allAccommodations());
  }

  useEffect(() => {
    refresh();
  }, []);

  const nameFor = (id) => visitors.find((v) => v.id === id)?.full_name || id;

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        String(b.client_created_at).localeCompare(String(a.client_created_at)),
      ),
    [rows],
  );

  async function onSubmit(e) {
    e.preventDefault();
    setNote(null);
    if (!form.visitor_id) {
      setNote({ type: "danger", text: "Choose a visitor." });
      return;
    }
    setBusy(true);
    try {
      await recordAccommodation(form.visitor_id, form.facility, Number(form.nights) || 1);
      await refreshOutbox();
      await refresh();
      setForm({ visitor_id: "", facility: LODGES[0], nights: 1 });
      setNote({ type: "success", text: "Accommodation recorded and queued for sync." });
    } catch {
      setNote({ type: "danger", text: "Could not record accommodation. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        icon="bi-house-door"
        title="Accommodation"
        subtitle="Record and review where visitors are staying"
      />

      <div className="row g-4">
        <div className="col-lg-5">
          <form onSubmit={onSubmit} className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-plus-circle" />
              <h2>Record accommodation</h2>
            </div>
            {note && <div className={`alert alert-${note.type}`}>{note.text}</div>}

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
                    {v.full_name} ({v.category})
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Facility / lodge</label>
              <select
                className="form-select"
                value={form.facility}
                onChange={(e) => setForm({ ...form, facility: e.target.value })}
              >
                {LODGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Nights</label>
              <div className="input-icon">
                <i className="bi bi-moon-stars" />
                <input
                  type="number"
                  min="1"
                  max="365"
                  className="form-control"
                  value={form.nights}
                  onChange={(e) => setForm({ ...form, nights: e.target.value })}
                />
              </div>
            </div>
            <button className={"btn btn-success" + (busy ? " is-busy" : "")} disabled={busy}>
              <i className={"bi " + (busy ? "bi-arrow-repeat spin" : "bi-check2-circle")} />{" "}
              {busy ? "Recording…" : "Record accommodation"}
            </button>
          </form>
        </div>

        <div className="col-lg-7">
          <div className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-list-check" />
              <h2>Recorded accommodation</h2>
            </div>
            {sorted.length === 0 ? (
              <div className="empty-state mb-0">
                <i className="bi bi-house" /> No accommodation recorded on this device yet.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Visitor</th>
                      <th>Facility</th>
                      <th className="text-end">Nights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {nameFor(r.visitor_id)}
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            {visitorCode(r.visitor_id)}
                          </div>
                        </td>
                        <td>{r.facility}</td>
                        <td className="text-end">{r.nights}</td>
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
