import { useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getActivities } from "../api/client.js";
import { getMeta, setMeta } from "../db/store.js";
import {
  activitiesForVisitor,
  allVisitors,
  captureActivity,
} from "../data/repository.js";

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

  return (
    <div className="row">
      <div className="col-lg-6">
        <h2 className="h4 mb-3">Capture activity</h2>
        {note && <div className={`alert alert-${note.type}`}>{note.text}</div>}
        <form onSubmit={onCapture} className="card card-body shadow-sm">
          <div className="mb-3">
            <label className="form-label">Visitor</label>
            <select
              className="form-select"
              value={visitorId}
              onChange={(e) => setVisitorId(e.target.value)}
            >
              <option value="">Select...</option>
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
              <option value="">Select...</option>
              {activeActivities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.is_free ? " (free)" : ""}
                </option>
              ))}
            </select>
            {activeActivities.length === 0 && (
              <div className="form-text text-warning">
                No catalogue cached yet. Connect once to download it.
              </div>
            )}
          </div>
          <div className="mb-3">
            <label className="form-label">Quantity</label>
            <input
              type="number"
              min="1"
              max="1000"
              className="form-control"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <button className="btn btn-success">Capture</button>
        </form>
      </div>

      <div className="col-lg-6">
        <h2 className="h4 mb-3">Captured for this visitor</h2>
        {captured.length === 0 && <p className="text-muted">Nothing captured yet.</p>}
        <ul className="list-group">
          {captured.map((c) => (
            <li key={c.id} className="list-group-item d-flex justify-content-between">
              <span>{nameFor(c.activity_id)}</span>
              <span className="text-muted">x{c.quantity}</span>
            </li>
          ))}
        </ul>
        <p className="small text-muted mt-3">
          Fees are intentionally not shown here: the server recomputes revenue authoritatively when
          the capture syncs, so no client figure can drift.
        </p>
      </div>
    </div>
  );
}
