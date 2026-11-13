import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

import { useApp } from "../context/AppContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import OsmMap from "../components/OsmMap.jsx";
import { createPoi, deletePoi, getActivities, getGates, getPois, updatePoi } from "../api/client.js";

const EMPTY = {
  name: "",
  kind: "facility",
  description: "",
  latitude: "",
  longitude: "",
  radius_m: 150,
  opening_hours: "",
  is_active: true,
  activity_id: "",
};

function toForm(p) {
  return { ...EMPTY, ...p, description: p.description || "", opening_hours: p.opening_hours || "", activity_id: p.activity_id || "" };
}

function toPayload(f) {
  return {
    name: f.name.trim(),
    kind: f.kind,
    description: f.description.trim() || null,
    latitude: Number(f.latitude),
    longitude: Number(f.longitude),
    radius_m: Number(f.radius_m) || 150,
    opening_hours: f.opening_hours.trim() || null,
    is_active: Boolean(f.is_active),
    activity_id: f.activity_id || null,
  };
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// One printable page per gate: the QR visitors scan with their own phone.
async function printGateSheet(gates) {
  const win = window.open("", "_blank");
  if (!win) return;
  const cards = await Promise.all(
    gates.map(async (g) => {
      const url = `${window.location.origin}/tour/gate/${encodeURIComponent(g.name)}`;
      const img = await QRCode.toDataURL(url, { width: 520, margin: 1 });
      return `<section><h1>${esc(g.name)}</h1><p>Scan with your phone camera to start your visit</p><img src="${img}" alt=""><small>${esc(url)}</small></section>`;
    }),
  );
  win.document.write(`<!doctype html><html><head><title>Gate QR codes</title><style>
body{font-family:Arial,sans-serif;margin:0;color:#16231d}
section{page-break-after:always;text-align:center;padding:48px 24px}
h1{font-size:34px;margin:0 0 8px;color:#15633f}p{font-size:18px;margin:0 0 24px}img{width:360px;height:360px}
small{display:block;margin-top:12px;color:#7c8a83;word-break:break-all}</style></head><body>${cards.join("")}
<script>window.onload=function(){window.print()}</script></body></html>`);
  win.document.close();
}

export default function PointsOfInterestPage() {
  const { session, online } = useApp();
  const token = session.token;
  const [pois, setPois] = useState([]);
  const [activities, setActivities] = useState([]);
  const [gates, setGates] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, a, g] = await Promise.all([getPois(token), getActivities(token), getGates(token)]);
      setPois(p);
      setActivities(a);
      setGates((g || []).filter((x) => x.is_active !== false));
    } catch (err) {
      setError(err?.message || "Could not load points of interest.");
    }
  }, [token]);

  useEffect(() => {
    if (online) load();
  }, [online, load]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  function edit(p) {
    setEditingId(p.id);
    setForm(toForm(p));
    setNote(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) })),
      () => setError("Could not read this device's location."),
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingId) await updatePoi(token, editingId, toPayload(form));
      else await createPoi(token, toPayload(form));
      setNote(editingId ? "Point of interest updated." : "Point of interest added.");
      reset();
      await load();
    } catch (err) {
      setError(err?.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(p) {
    if (!window.confirm(`Delete ${p.name}? Its nearby-alert history goes with it.`)) return;
    try {
      await deletePoi(token, p.id);
      await load();
    } catch (err) {
      setError(err?.message || "Could not delete.");
    }
  }

  const placeholders = pois.filter((p) => p.name.startsWith("PLACEHOLDER")).length;

  return (
    <>
      <PageHeader
        icon="bi-pin-map"
        title="Points of interest"
        subtitle="Facilities and activities visitors are alerted about on their phones"
        actions={
          <button type="button" className="btn btn-outline-success btn-sm" onClick={() => printGateSheet(gates)} disabled={!gates.length}>
            <i className="bi bi-printer" /> Print gate QR codes
          </button>
        }
      />
      {!online && <div className="alert alert-warning py-2">Managing points of interest needs a connection.</div>}
      {placeholders > 0 && (
        <div className="alert alert-info py-2">
          {placeholders} placeholder entr{placeholders === 1 ? "y is" : "ies are"} seeded for illustration only. Replace them with
          real names, locations and hours before activating.
        </div>
      )}
      {note && <div className="alert alert-success py-2">{note}</div>}
      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="row g-3">
        <div className="col-lg-5">
          <form className="surface-card p-4" onSubmit={onSubmit}>
            <h3 className="vp__card-title">{editingId ? "EDIT POINT" : "NEW POINT"}</h3>
            <label className="form-label">Name</label>
            <input className="form-control mb-2" value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={128} />
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">Type</label>
                <select className="form-select mb-2" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
                  <option value="facility">Facility</option>
                  <option value="activity">Activity</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label">Alert radius (m)</label>
                <input type="number" min={10} max={20000} className="form-control mb-2" value={form.radius_m} onChange={(e) => set("radius_m", e.target.value)} required />
              </div>
            </div>
            {form.kind === "activity" && (
              <>
                <label className="form-label">Linked activity</label>
                <select className="form-select mb-2" value={form.activity_id} onChange={(e) => set("activity_id", e.target.value)}>
                  <option value="">None</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </>
            )}
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">Latitude</label>
                <input type="number" step="any" min={-90} max={90} className="form-control mb-2" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} required />
              </div>
              <div className="col-6">
                <label className="form-label">Longitude</label>
                <input type="number" step="any" min={-180} max={180} className="form-control mb-2" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} required />
              </div>
            </div>
            <div className="mb-2">
              <button type="button" className="btn btn-link btn-sm px-0" onClick={useMyLocation}>
                <i className="bi bi-crosshair" /> Use this device's location
              </button>
            </div>
            <label className="form-label">Opening hours</label>
            <input className="form-control mb-2" value={form.opening_hours} onChange={(e) => set("opening_hours", e.target.value)} maxLength={128} placeholder="e.g. 07:00–18:00" />
            <label className="form-label">Description</label>
            <textarea className="form-control mb-2" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
            <div className="form-check mb-3">
              <input id="poi-active" type="checkbox" className="form-check-input" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              <label htmlFor="poi-active" className="form-check-label">Active (sent to visitors' phones)</label>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-success" disabled={busy || !online}>
                {editingId ? "Save changes" : "Add point"}
              </button>
              {editingId && (
                <button type="button" className="btn btn-outline-secondary" onClick={reset}>Cancel</button>
              )}
            </div>
          </form>
        </div>

        <div className="col-lg-7">
          {online && pois.some((p) => p.is_active) && (
            <div className="mb-3">
              <OsmMap
                height={260}
                fitKey={pois.length}
                markers={pois.filter((p) => p.is_active).map((p) => ({ id: p.id, latitude: p.latitude, longitude: p.longitude, label: p.name, radius_m: p.radius_m }))}
                onSelect={(id) => edit(pois.find((p) => p.id === id))}
              />
            </div>
          )}
          <div className="surface-card p-0">
            <table className="table mb-0 align-middle">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th className="text-end">Radius</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pois.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted text-center py-4">No points of interest yet.</td>
                  </tr>
                )}
                {pois.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="fw-semibold">{p.name}</div>
                      <div className="muted small">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}{p.opening_hours ? ` · ${p.opening_hours}` : ""}</div>
                    </td>
                    <td className="text-capitalize">{p.kind}</td>
                    <td className="text-end">{p.radius_m} m</td>
                    <td>
                      <span className={"pill " + (p.is_active ? "green" : "neutral")}>{p.is_active ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="text-end text-nowrap">
                      <button type="button" className="icon-btn icon-btn--sm" title="Edit" onClick={() => edit(p)}>
                        <i className="bi bi-pencil" />
                      </button>
                      <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" title="Delete" onClick={() => onDelete(p)}>
                        <i className="bi bi-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
