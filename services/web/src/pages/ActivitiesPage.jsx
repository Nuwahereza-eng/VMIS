import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getActivities } from "../api/client.js";
import { getMeta, setMeta } from "../db/store.js";
import {
  activitiesForVisitor,
  allVisitors,
  captureActivity,
} from "../data/repository.js";
import PageHeader from "../components/PageHeader.jsx";

const CATALOGUE_KEY = "activity_catalogue";

export default function ActivitiesPage() {
  const { session, online, refreshOutbox } = useApp();
  const [catalogue, setCatalogue] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [visitorId, setVisitorId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [captured, setCaptured] = useState([]);
  const [note, setNote] = useState(null);

  useEffect(() => {
    (async () => {
      setVisitors(await allVisitors());
      // Cache the catalogue so activity capture works offline afterwards.
      const cached = (await getMeta(CATALOGUE_KEY)) || [];
      setCatalogue(cached);
      if (online) {
        try {
          const fresh = await getActivities(session.token);
          setCatalogue(fresh);
          await setMeta(CATALOGUE_KEY, fresh);
        } catch {
          /* fall back to the cached catalogue */
        }
      }
    })();
  }, [online, session.token]);

  useEffect(() => {
    (async () => {
      if (visitorId) setCaptured(await activitiesForVisitor(visitorId));
      else setCaptured([]);
    })();
  }, [visitorId]);

  const activeActivities = catalogue.filter((a) => a.is_active !== false);

  async function onCapture(e) {
    e.preventDefault();
    setNote(null);
    const visitor = visitors.find((v) => v.id === visitorId);
    if (!visitor || !activityId) {
      setNote({ type: "danger", text: "Choose a visitor and an activity." });
      return;
    }
    await captureActivity(visitorId, activityId, Number(quantity), visitor.category, session.stationId);
    await refreshOutbox();
    setCaptured(await activitiesForVisitor(visitorId));
    setNote({
      type: "success",
      text: "Activity captured locally. The server computes the fee on sync.",
    });
    setActivityId("");
    setQuantity(1);
  }

  const nameFor = (id) => catalogue.find((a) => a.id === id)?.name || id;
  const selectedVisitor = visitors.find((v) => v.id === visitorId);

  return (
    <>
      <PageHeader
        icon="bi-binoculars"
        title="Activity capture"
        subtitle="Log activities per visitor; the server prices them authoritatively on sync"
      />

      <div className="row g-4">
        <div className="col-lg-6">
          <form onSubmit={onCapture} className="surface-card p-4">
            <div className="card-title-row">
              <i className="bi bi-plus-circle" />
              <h2>Capture activity</h2>
            </div>
            {note && <div className={`alert alert-${note.type}`}>{note.text}</div>}

            <div className="mb-3">
              <label className="form-label">Visitor</label>
              <select
                className="form-select"
                value={visitorId}
                onChange={(e) => setVisitorId(e.target.value)}
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
              <label className="form-label">Activity</label>
              <select
                className="form-select"
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
              >
                <option value="">Select an activity…</option>
                {activeActivities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.is_free ? " (free)" : ""}
                  </option>
                ))}
              </select>
              {activeActivities.length === 0 && (
                <div className="form-text text-warning">
                  <i className="bi bi-exclamation-triangle me-1" />
                  No catalogue cached yet. Connect once to download it.
                </div>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label">Quantity</label>
              <div className="input-icon">
                <i className="bi bi-123" />
                <input
                  type="number"
                  min="1"
                  max="1000"
                  className="form-control"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
            <button className="btn btn-success">
              <i className="bi bi-check2-circle" /> Capture activity
            </button>
          </form>
        </div>

        <div className="col-lg-6">
          <div className="surface-card p-4 mb-3">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="card-title-row mb-0">
                <i className="bi bi-list-check" />
                <h2>Captured</h2>
              </div>
              {selectedVisitor && <span className="pill neutral">{selectedVisitor.full_name}</span>}
            </div>

            {!visitorId ? (
              <div className="empty-state">
                <i className="bi bi-person-lines-fill" />
                Choose a visitor to see their captured activities.
              </div>
            ) : captured.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-inbox" />
                Nothing captured for this visitor yet.
              </div>
            ) : (
              <div>
                {captured.map((c) => (
                  <div key={c.id} className="data-row">
                    <span className="d-flex align-items-center gap-2">
                      <i className="bi bi-binoculars muted" />
                      <span style={{ color: "var(--vmis-ink)", fontWeight: 500 }}>
                        {nameFor(c.activity_id)}
                      </span>
                    </span>
                    <span className="pill neutral">×{c.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="note-card">
            <h3>
              <i className="bi bi-shield-lock" /> Server prices the fees
            </h3>
            <p>
              Fees are intentionally not shown on the device. The server recomputes revenue
              authoritatively when the capture syncs, so no client figure can ever drift.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
