import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import OsmMap from "../components/OsmMap.jsx";
import { getGates, getLivePositions, getPoiSummary, getSessionPath } from "../api/client.js";
import { CATEGORIES } from "../domain/categories.js";

const REFRESH_MS = 60 * 1000;
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));
const AGE_FILTERS = [
  { key: "", label: "Any time" },
  { key: "fresh", label: "Updated in the last 10 min", maxAge: 10 },
  { key: "hour", label: "Updated in the last hour", maxAge: 60 },
  { key: "old", label: "No update for 30+ min", minAge: 30 },
];

function ago(seconds) {
  if (seconds == null) return "No location yet";
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}

function time(value) {
  return value ? new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
}

// Management view of visitors on tour. Needs the view_visitor_locations
// permission, enforced by the server. A position is the last one the phone
// managed to upload, so it can be old if the phone was offline: the age is
// always shown next to it.
export default function LiveTrackingPage() {
  const { session, online } = useApp();
  const token = session.token;
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState([]);
  const [gates, setGates] = useState([]);
  const [gate, setGate] = useState("");
  const [category, setCategory] = useState("");
  const [age, setAge] = useState("");
  const location = useLocation();
  const [selected, setSelected] = useState(location.state?.sessionId || null);
  const [path, setPath] = useState(null);
  const [error, setError] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);

  const ageFilter = AGE_FILTERS.find((a) => a.key === age) || AGE_FILTERS[0];

  const load = useCallback(async () => {
    try {
      const [live, summary] = await Promise.all([
        getLivePositions(token, { gate, category, minAge: ageFilter.minAge, maxAge: ageFilter.maxAge }),
        getPoiSummary(token),
      ]);
      setRows(live);
      setBusy(summary);
      setError(null);
      setLoadedAt(new Date());
    } catch (err) {
      setError(err?.message || "Could not load live positions.");
    }
  }, [token, gate, category, ageFilter.minAge, ageFilter.maxAge]);

  useEffect(() => {
    if (!online) return undefined;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [online, load]);

  useEffect(() => {
    if (online) getGates(token).then((g) => setGates(g || [])).catch(() => {});
  }, [online, token]);

  useEffect(() => {
    if (!selected) {
      setPath(null);
      return;
    }
    getSessionPath(token, selected).then(setPath).catch((err) => setError(err?.message || "Could not load the path."));
  }, [selected, token, loadedAt]);

  const markers = useMemo(() => {
    const visitors = rows
      .filter((r) => r.latitude != null)
      .map((r) => ({
        id: r.session_id,
        latitude: r.latitude,
        longitude: r.longitude,
        label: `${r.holder_name} · ${ago(r.age_seconds)}`,
        color: r.stale ? "#b4362f" : r.session_id === selected ? "#c98a1f" : "#15633f",
        size: r.session_id === selected ? 9 : 7,
      }));
    const pois = busy.map((p) => ({ id: `poi-${p.poi_id}`, latitude: p.latitude, longitude: p.longitude, label: `${p.name}: ${p.visitors_near} near`, radius_m: p.radius_m, color: "#1f6f8b", size: 4 }));
    return [...pois, ...visitors];
  }, [rows, busy, selected]);

  const withLocation = rows.filter((r) => r.latitude != null).length;

  return (
    <>
      <PageHeader
        icon="bi-broadcast"
        title="Live tracking"
        subtitle="Visitors on tour and where their phones last reported"
        actions={
          <button type="button" className="btn btn-outline-success btn-sm" onClick={load} disabled={!online}>
            <i className="bi bi-arrow-clockwise" /> Refresh
          </button>
        }
      />
      {!online && <div className="alert alert-warning py-2">Live tracking needs a connection.</div>}
      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="alert alert-info py-2 small">
        Each position is the last one the visitor's phone uploaded. Phones without signal upload later,
        so a position can be old: check how long ago it was recorded.
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <select className="form-select form-select-sm w-auto" value={gate} onChange={(e) => setGate(e.target.value)} aria-label="Gate">
          <option value="">All gates</option>
          {gates.map((g) => (
            <option key={g.id} value={g.name}>{g.name}</option>
          ))}
        </select>
        <select className="form-select form-select-sm w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <select className="form-select form-select-sm w-auto" value={age} onChange={(e) => setAge(e.target.value)} aria-label="Time since last update">
          {AGE_FILTERS.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
        <span className="muted small align-self-center ms-auto">
          {rows.length} on tour · {withLocation} with a location{loadedAt ? ` · refreshed ${time(loadedAt)}` : ""}
        </span>
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          {online && <OsmMap height={420} fitKey={`${gate}-${category}-${age}-${rows.length}`} markers={markers} path={path?.points || []} onSelect={(id) => !String(id).startsWith("poi-") && setSelected(id)} />}
          {path && (
            <div className="surface-card p-3 mt-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong>{path.session.holder_name}: path this visit</strong>
                <button type="button" className="btn-close" aria-label="Close path" onClick={() => setSelected(null)} />
              </div>
              {path.points.length === 0 ? (
                <div className="muted small">No points recorded yet{path.session.consent_given ? "" : " (the visitor declined location sharing)"}.</div>
              ) : (
                <div className="muted small">
                  {path.points.length} point{path.points.length === 1 ? "" : "s"} from {time(path.points[0].recorded_at)} to{" "}
                  {time(path.points[path.points.length - 1].recorded_at)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="col-lg-5">
          <div className="surface-card p-0 mb-3">
            <table className="table mb-0 align-middle small">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Last update</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="muted text-center py-4">No visitors on tour match these filters.</td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.session_id} className={r.session_id === selected ? "table-active" : ""} style={{ cursor: "pointer" }} onClick={() => setSelected(r.session_id)}>
                    <td>
                      <div className="fw-semibold">{r.holder_name}</div>
                      <div className="muted">
                        {CATEGORY_LABEL[r.category] || r.category || "—"} · {r.gate || "—"}
                      </div>
                    </td>
                    <td>
                      {!r.consent_given ? (
                        <span className="pill neutral">Declined location</span>
                      ) : (
                        <span className={"pill " + (r.stale ? "expired" : "green")}>
                          <i className={"bi " + (r.stale ? "bi-exclamation-triangle" : "bi-broadcast")} /> {ago(r.age_seconds)}
                        </span>
                      )}
                      {r.stale && <div className="muted">May be out of date</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="surface-card p-3">
            <h3 className="vp__card-title">BUSY AREAS</h3>
            {busy.length === 0 ? (
              <div className="muted small">No active points of interest.</div>
            ) : (
              <ul className="list-unstyled mb-0">
                {busy.map((p) => (
                  <li key={p.poi_id} className="d-flex justify-content-between py-1 border-bottom">
                    <span>{p.name}</span>
                    <strong>{p.visitors_near}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
