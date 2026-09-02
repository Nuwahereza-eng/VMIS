import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import { getActivities } from "../api/client.js";
import { getMeta, setMeta } from "../db/store.js";
import { CATEGORY_CURRENCY, formatMinor } from "../domain/categories.js";
import { visitorCode } from "../domain/ids.js";
import { computeValidity } from "../domain/tickets.js";
import {
  activitiesForVisitor,
  allVisitors,
  captureActivity,
  visitsForVisitor,
} from "../data/repository.js";

const CATALOGUE_KEY = "activity_catalogue";
const PAYMENT_METHODS = ["Cash", "Mobile Money", "Card", "Bank Transfer"];

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function formatRemaining(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${days} Day${days === 1 ? "" : "s"} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function ActivitiesPage() {
  const { session, online, refreshOutbox } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [visitors, setVisitors] = useState([]);
  const [visitorId, setVisitorId] = useState(location.state?.visitorId || "");
  const [catalogue, setCatalogue] = useState([]);
  const [selected, setSelected] = useState({}); // activityId -> true
  const [previousActs, setPreviousActs] = useState([]);
  const [openVisit, setOpenVisit] = useState(null);
  const [validity, setValidity] = useState(null);
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  // Load visitors + the cached fee catalogue (refresh from server when online).
  useEffect(() => {
    (async () => {
      setVisitors(await allVisitors());
      let cat = (await getMeta(CATALOGUE_KEY)) || [];
      if (online) {
        try {
          cat = await getActivities(session.token);
          await setMeta(CATALOGUE_KEY, cat);
        } catch {
          /* keep cached */
        }
      }
      setCatalogue(cat);
    })();
  }, [online, session.token]);

  const visitor = visitors.find((v) => v.id === visitorId) || null;
  const currency = visitor ? CATEGORY_CURRENCY[visitor.category] || "USD" : "USD";

  // Load this visitor's prior activities + open visit for the ticket countdown.
  useEffect(() => {
    (async () => {
      if (!visitorId) {
        setPreviousActs([]);
        setOpenVisit(null);
        return;
      }
      setPreviousActs(await activitiesForVisitor(visitorId));
      const visits = await visitsForVisitor(visitorId);
      setOpenVisit(visits.find((v) => !v.exit_timestamp) || null);
      setSelected({});
    })();
  }, [visitorId]);

  useEffect(() => {
    if (!openVisit) {
      setValidity(null);
      return;
    }
    const tick = () =>
      setValidity(computeValidity(openVisit.entry_timestamp, openVisit.nights_purchased));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [openVisit]);

  const activeActivities = catalogue.filter((a) => a.is_active !== false);

  function rateFor(activity) {
    if (!activity || !visitor) return null;
    if (activity.is_free) return 0;
    const r = (activity.rates || []).find((x) => x.category === visitor.category);
    return r ? r.amount_minor : null;
  }

  function priceFor(activityId) {
    return rateFor(catalogue.find((a) => a.id === activityId));
  }

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const amount = selectedIds.reduce((sum, id) => sum + (priceFor(id) || 0), 0);

  const previousAmount = useMemo(() => {
    return previousActs.reduce((sum, line) => {
      const p = priceFor(line.activity_id);
      return sum + (p || 0) * (line.quantity || 1);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousActs, catalogue, visitor]);

  const totalPayable = previousAmount + amount;

  function toggle(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  async function onConfirm() {
    setNote(null);
    if (!visitor) {
      setNote({ type: "danger", text: "Choose a visitor first." });
      return;
    }
    if (selectedIds.length === 0) {
      setNote({ type: "danger", text: "Select at least one activity." });
      return;
    }
    setBusy(true);
    try {
      for (const id of selectedIds) {
        await captureActivity(visitorId, id, 1, visitor.category, session.stationId);
      }
      await refreshOutbox();
      setPreviousActs(await activitiesForVisitor(visitorId));
      const count = selectedIds.length;
      const names = selectedIds.map((id) => catalogue.find((a) => a.id === id)?.name).filter(Boolean);
      setSelected({});
      setDone({
        visitorId,
        visitorName: visitor.full_name,
        code: visitorCode(visitor.id),
        count,
        names,
        amount,
        currency,
        method,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setNote({ type: "danger", text: "Could not save. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  // Clear the confirmation and let the officer serve another visitor.
  function recordAnother() {
    setDone(null);
    setNote(null);
    setSelected({});
    setVisitorId("");
  }

  if (done) {
    return (
      <div className="aap fade-in">
        <div className="aap__topbar">
          <button className="vp__back" onClick={() => navigate(-1)} aria-label="Back">
            <i className="bi bi-arrow-left" />
          </button>
          <h1 className="vp__title">Add Activity / Payment</h1>
        </div>

        <div className="aap__body">
          <div className="reg__done">
            <div className="reg__done-card surface-card">
              <div className="reg__done-badge">
                <i className="bi bi-check-lg" />
              </div>
              <h2 className="reg__done-title">Payment recorded</h2>
              <p className="reg__done-name">{done.visitorName}</p>
              <p className="reg__done-sub">
                {done.count} activit{done.count === 1 ? "y" : "ies"} queued for sync.
              </p>

              <div className="reg__done-amount">
                {done.amount > 0 ? formatMinor(done.amount, done.currency) : "No charge"}
              </div>

              <div className="reg__done-facts">
                <span className="reg__done-fact">
                  <i className="bi bi-person-badge" /> {done.code}
                </span>
                <span className="reg__done-fact">
                  <i className="bi bi-credit-card" /> {done.method}
                </span>
              </div>

              {done.names.length > 0 && (
                <ul className="reg__done-list">
                  {done.names.map((n) => (
                    <li key={n}>
                      <i className="bi bi-check2" /> {n}
                    </li>
                  ))}
                </ul>
              )}

              <div className="reg__done-actions">
                <button className="btn btn-success" onClick={recordAnother}>
                  <i className="bi bi-plus-circle" /> Serve another visitor
                </button>
                <button
                  className="btn btn-outline-success"
                  onClick={() =>
                    navigate("/visitors", {
                      state: { search: done.visitorName, openVisitorId: done.visitorId },
                    })
                  }
                >
                  <i className="bi bi-person-badge" /> View profile
                </button>
                <button className="btn btn-light" onClick={() => navigate("/")}>
                  <i className="bi bi-grid" /> Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="aap fade-in">
      <div className="aap__topbar">
        <button className="vp__back" onClick={() => navigate(-1)} aria-label="Back">
          <i className="bi bi-arrow-left" />
        </button>
        <h1 className="vp__title">Add Activity / Payment</h1>
      </div>

      <div className="aap__body">
        {!visitorId && (
          <div className="surface-card p-3 mb-1">
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
        )}

        {note && <div className={`alert alert-${note.type}`}>{note.text}</div>}

        {visitor && (
          <div className="aap__grid">
            <div className="aap__main">
              {/* Visitor + remaining time */}
              <div className="aap__visitor surface-card p-3">
                <div className="aap__visitor-id">
                  <div className="data-row__avatar">{initials(visitor.full_name)}</div>
                  <div>
                    <div className="small-caps muted">Visitor</div>
                    <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                      {visitor.full_name}
                    </div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>
                      {visitorCode(visitor.id)}
                    </div>
                  </div>
                  {validity && (
                    <span className={"pill " + (validity.status === "Active" ? "active" : "expired")}>
                      {validity.status === "Active" ? "VALID" : "EXPIRED"}
                    </span>
                  )}
                </div>
                <div className="aap__remaining">
                  <div className="vp__remaining-label">
                    <i className="bi bi-clock-history" /> REMAINING TIME
                  </div>
                  <div className="aap__remaining-clock">
                    {validity && validity.status === "Active"
                      ? formatRemaining(validity.remainingSeconds)
                      : validity
                        ? "Expired"
                        : "No active ticket"}
                  </div>
                </div>
              </div>

              {/* Select activity */}
              <div className="surface-card p-4">
                <h3 className="vp__card-title">SELECT ACTIVITY</h3>
                {activeActivities.length === 0 ? (
                  <div className="empty-state mb-0">
                    <i className="bi bi-exclamation-triangle" /> No catalogue cached yet. Connect
                    once to download it.
                  </div>
                ) : (
                  <div className="aap__acts">
                    {activeActivities.map((a) => {
                      const price = rateFor(a);
                      return (
                        <label key={a.id} className="aap__act">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={Boolean(selected[a.id])}
                            onChange={() => toggle(a.id)}
                          />
                          <span className="aap__act-name">{a.name}</span>
                          <span className="aap__act-price">
                            {a.is_free
                              ? "Free"
                              : price === null
                                ? "N/A"
                                : formatMinor(price, currency)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Payment summary */}
            <div className="surface-card p-4 aap__summary">
              <h3 className="vp__card-title">PAYMENT SUMMARY</h3>
              <div className="aap__sumrow">
                <span>Selected Activities</span>
                <span className="fw-semibold">{selectedIds.length}</span>
              </div>
              <div className="aap__sumrow">
                <span>Amount</span>
                <span className="fw-semibold">{formatMinor(amount, currency)}</span>
              </div>
              <div className="aap__sumrow">
                <span>Previous Payments</span>
                <span className="fw-semibold">{formatMinor(previousAmount, currency)}</span>
              </div>
              <div className="aap__sumrow aap__sumrow--total">
                <span>TOTAL PAYABLE</span>
                <span>{formatMinor(totalPayable, currency)}</span>
              </div>

              <label className="form-label mt-3">Payment Method</label>
              <select
                className="form-select"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <button className={"btn btn-success w-100 mt-3" + (busy ? " is-busy" : "")} onClick={onConfirm} disabled={busy}>
                <i className={"bi " + (busy ? "bi-arrow-repeat spin" : "bi-check2-circle")} />{" "}
                {busy ? "Saving…" : "Confirm & Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
