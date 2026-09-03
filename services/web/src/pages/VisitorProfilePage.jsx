import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import { getActivities, getVisitorAccommodations, getVisitorActivities, getVisitorVisits } from "../api/client.js";
import { getMeta, setMeta } from "../db/store.js";
import {
  CATEGORIES,
  CATEGORY_CURRENCY,
  formatMinor,
} from "../domain/categories.js";
import { computeValidity } from "../domain/tickets.js";
import {
  visitsForVisitor,
  activitiesForVisitor,
  accommodationsForVisitor,
  recordExit,
} from "../data/repository.js";

const CATALOGUE_KEY = "activity_catalogue";
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function displayCode(id) {
  return "VM-" + String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatDateTime(iso) {
  if (!iso) return "Not recorded";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso) {
  if (!iso) return "Not recorded";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRemaining(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${days} Day${days === 1 ? "" : "s"} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const TABS = ["Overview", "Activities", "Accommodation", "Payments", "History"];

export default function VisitorProfilePage({ visitor, onBack, onScanQr }) {
  const { session, online } = useApp();
  const navigate = useNavigate();

  const [tab, setTab] = useState("Overview");
  const [visits, setVisits] = useState([]);
  const [openVisit, setOpenVisit] = useState(null);
  const [activities, setActivities] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [validity, setValidity] = useState(null);
  const [exited, setExited] = useState(false);
  const [exiting, setExiting] = useState(false);

  const currency = CATEGORY_CURRENCY[visitor.category] || "USD";

  // Load this visitor's visits / activities / accommodation from the local
  // store (same source the Verify screen uses), plus the cached fee catalogue.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [v, a, acc] = await Promise.all([
        visitsForVisitor(visitor.id),
        activitiesForVisitor(visitor.id),
        accommodationsForVisitor(visitor.id),
      ]);
      if (!alive) return;

      // Hydrate visits from the system of record when online, so a visitor
      // registered/entered at another station still shows their real ticket,
      // entry time and gate here (the local store only holds this device's
      // writes). Server records win on id; local-only records are kept.
      let mergedVisits = v;
      let mergedActivities = a;
      let mergedAccommodations = acc;
      if (online) {
        const mergeById = (local, server) => {
          if (!Array.isArray(server)) return local;
          const byId = new Map(local.map((x) => [x.id, x]));
          for (const sv of server) byId.set(sv.id, sv);
          return [...byId.values()];
        };
        try {
          mergedVisits = mergeById(mergedVisits, await getVisitorVisits(session.token, visitor.id));
        } catch {
          /* keep local visits */
        }
        try {
          mergedActivities = mergeById(
            mergedActivities,
            await getVisitorActivities(session.token, visitor.id),
          );
        } catch {
          /* keep local activities */
        }
        try {
          mergedAccommodations = mergeById(
            mergedAccommodations,
            await getVisitorAccommodations(session.token, visitor.id),
          );
        } catch {
          /* keep local accommodations */
        }
      }
      if (!alive) return;

      setVisits(mergedVisits);
      setActivities(mergedActivities);
      setAccommodations(mergedAccommodations);
      const open = mergedVisits.find((x) => !x.exit_timestamp) || null;
      setOpenVisit(open);

      let cat = (await getMeta(CATALOGUE_KEY)) || [];
      if (online) {
        try {
          cat = await getActivities(session.token);
          await setMeta(CATALOGUE_KEY, cat);
        } catch {
          /* keep the cached catalogue */
        }
      }
      if (alive) setCatalogue(cat);
    })();
    return () => {
      alive = false;
    };
  }, [visitor.id, online, session.token]);

  // Live ticket countdown from the open visit.
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

  const nameFor = (activityId) => catalogue.find((a) => a.id === activityId)?.name || activityId;

  // Amount for a captured activity in the visitor's category currency.
  const amountFor = (line) => {
    const entry = catalogue.find((a) => a.id === line.activity_id);
    if (!entry) return null;
    if (entry.is_free) return 0;
    const rate = (entry.rates || []).find((r) => r.category === visitor.category);
    if (!rate) return null;
    return rate.amount_minor * (line.quantity || 1);
  };

  const payments = useMemo(
    () =>
      activities.map((line) => ({
        id: line.id,
        name: nameFor(line.activity_id),
        date: line.client_created_at,
        quantity: line.quantity || 1,
        amount: amountFor(line),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, catalogue],
  );

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const anyUnpriced = payments.some((p) => p.amount === null);

  const active = validity?.status === "Active";
  // The visit whose entry details head the profile: the open one if inside,
  // otherwise the most recent on record. Visits are stored most-recent-first
  // from the server; sort defensively for local-only records too.
  const heroVisit =
    openVisit ||
    [...visits].sort((a, b) =>
      String(b.entry_timestamp).localeCompare(String(a.entry_timestamp)),
    )[0] ||
    null;
  const statusPill = !heroVisit
    ? { text: "No ticket", cls: "neutral", icon: "bi-dash-circle" }
    : openVisit
      ? active
        ? { text: "Valid", cls: "active", icon: "bi-check-circle-fill" }
        : { text: "Expired", cls: "expired", icon: "bi-x-circle-fill" }
      : { text: "Checked out", cls: "neutral", icon: "bi-box-arrow-right" };

  async function onRecordExit() {
    if (!openVisit) return;
    setExiting(true);
    try {
      await recordExit(openVisit.id, {}, session.stationId);
      setExited(true);
      setOpenVisit(null);
    } finally {
      setExiting(false);
    }
  }

  return (
    <div className="vp fade-in">
      <div className="vp__topbar">
        <button className="vp__back" onClick={onBack} aria-label="Back">
          <i className="bi bi-arrow-left" />
        </button>
        <h1 className="vp__title">Visitor Profile</h1>
        <button className="vp__scan" onClick={() => (onScanQr ? onScanQr() : navigate("/verify"))}>
          <i className="bi bi-qr-code-scan" /> Scan QR
        </button>
      </div>

      <div className="vp__body">
        {exited && (
          <div className="alert alert-success">Exit recorded for {visitor.full_name}.</div>
        )}

        {/* Identity header */}
        <div className="vp__hero surface-card">
          <div className="vp__avatar">{initials(visitor.full_name)}</div>
          <div className="vp__ident">
            <div className="vp__idrow">
              <span className="vp__code">{displayCode(visitor.id)}</span>
              <span className={"pill " + statusPill.cls}>
                <i className={"bi " + statusPill.icon} /> {statusPill.text}
              </span>
            </div>
            <div className="vp__name">{visitor.full_name}</div>
            <div className="vp__nat">
              <i className="bi bi-geo-alt" />
              <span>{visitor.country || visitor.nationality || "Not provided"}</span>
              <span className="vp__cat">{CATEGORY_LABEL[visitor.category] || visitor.category}</span>
            </div>
            {heroVisit ? (
              <div className="vp__metarow">
                <span className="vp__meta">
                  <i className="bi bi-box-arrow-in-right" /> {formatDateTime(heroVisit.entry_timestamp)}
                </span>
                <span className="vp__meta">
                  <i className="bi bi-door-open" /> {heroVisit.entry_gate || "—"}
                </span>
                {heroVisit.ticket_number && (
                  <span className="vp__meta">
                    <i className="bi bi-ticket-perforated" /> {heroVisit.ticket_number}
                  </span>
                )}
              </div>
            ) : (
              <div className="vp__meta vp__meta--muted">
                <i className="bi bi-info-circle" />{" "}
                {online ? "No visit on record yet" : "Reconnect to load visit details"}
              </div>
            )}
          </div>
          <div className="vp__remaining">
            <div className="vp__remaining-label">
              <i className="bi bi-clock-history" /> REMAINING TIME
            </div>
            {openVisit && validity ? (
              active ? (
                <>
                  <div className="vp__remaining-clock">{formatRemaining(validity.remainingSeconds)}</div>
                  <div className="vp__remaining-exp">Expires: {formatDateTime(validity.expiry.toISOString())}</div>
                </>
              ) : (
                <>
                  <div className="vp__remaining-clock text-danger">Expired</div>
                  <div className="vp__remaining-exp">Expired: {formatDateTime(validity.expiry.toISOString())}</div>
                </>
              )
            ) : (
              <div className="vp__remaining-exp">No active ticket on this device.</div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="vp__tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={"vp__tab" + (tab === t ? " is-active" : "")}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Overview" && (
          <div className="vp__grid">
            <div className="surface-card p-4">
              <h3 className="vp__card-title">VISITOR INFORMATION</h3>
              <dl className="vp__info">
                <dt>Passport No.</dt>
                <dd>{visitor.id_number || "Not provided"}</dd>
                <dt>Phone</dt>
                <dd>{visitor.phone || "Not provided"}</dd>
                <dt>Email</dt>
                <dd>{visitor.email || "Not provided"}</dd>
                <dt>No. of Nights</dt>
                <dd>{openVisit ? `${openVisit.nights_purchased} Nights` : "Not recorded"}</dd>
                <dt>Category</dt>
                <dd>{CATEGORY_LABEL[visitor.category] || visitor.category}</dd>
                <dt>Vehicle Reg.</dt>
                <dd>{visitor.vehicle_registration || "Not provided"}</dd>
                <dt>Tour Operator</dt>
                <dd>{visitor.tour_company || "Not provided"}</dd>
              </dl>
            </div>

            <div className="surface-card p-4">
              <h3 className="vp__card-title">ACTIVITIES UNDERTAKEN</h3>
              {activities.length === 0 ? (
                <div className="empty-state mb-3">
                  <i className="bi bi-binoculars" /> No activities captured yet.
                </div>
              ) : (
                <ul className="vp__acts">
                  {activities.map((line) => (
                    <li key={line.id}>
                      <span className="vp__act-name">
                        <i className="bi bi-check-circle-fill" /> {nameFor(line.activity_id)}
                      </span>
                      <span className="vp__act-date">{formatDate(line.client_created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="btn btn-ghost btn-sm mt-2"
                onClick={() => navigate("/activities", { state: { visitorId: visitor.id } })}
              >
                <i className="bi bi-plus-lg" /> Add Activity
              </button>
            </div>

            <div className="surface-card p-4">
              <h3 className="vp__card-title">ACCOMMODATION</h3>
              {accommodations.length === 0 ? (
                <div className="empty-state mb-0">
                  <i className="bi bi-house-door" /> No accommodation recorded.
                </div>
              ) : (
                accommodations.map((a) => (
                  <div key={a.id} className="mb-2">
                    <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                      {a.facility}
                    </div>
                    <div className="muted" style={{ fontSize: "0.86rem" }}>
                      Nights: {a.nights}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="surface-card p-4 vp__total">
              <h3 className="vp__card-title">TOTAL PAID</h3>
              <div className="vp__total-amount">
                {anyUnpriced && payments.length ? "≈ " : ""}
                {formatMinor(totalPaid, currency)}
              </div>
              <button className="btn-link-green" onClick={() => setTab("Payments")}>
                View Payment Details <i className="bi bi-arrow-right" />
              </button>
            </div>
          </div>
        )}

        {tab === "Activities" && (
          <div className="surface-card p-4">
            <h3 className="vp__card-title">ACTIVITIES UNDERTAKEN</h3>
            {activities.length === 0 ? (
              <div className="empty-state mb-0">
                <i className="bi bi-binoculars" /> No activities captured yet.
              </div>
            ) : (
              <ul className="vp__acts">
                {activities.map((line) => (
                  <li key={line.id}>
                    <span className="vp__act-name">
                      <i className="bi bi-check-circle-fill" /> {nameFor(line.activity_id)}
                      {line.quantity > 1 ? ` ×${line.quantity}` : ""}
                    </span>
                    <span className="vp__act-date">{formatDate(line.client_created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "Accommodation" && (
          <div className="surface-card p-4">
            <h3 className="vp__card-title">ACCOMMODATION</h3>
            {accommodations.length === 0 ? (
              <div className="empty-state mb-0">
                <i className="bi bi-house-door" /> No accommodation recorded.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Facility</th>
                      <th className="text-end">Nights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accommodations.map((a) => (
                      <tr key={a.id}>
                        <td>{a.facility}</td>
                        <td className="text-end">{a.nights}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "Payments" && (
          <div className="surface-card p-4">
            <h3 className="vp__card-title">PAYMENT DETAILS</h3>
            {payments.length === 0 ? (
              <div className="empty-state mb-0">
                <i className="bi bi-cash-stack" /> Nothing billed yet.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Activity</th>
                      <th>Date</th>
                      <th className="text-end">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.name}
                          {p.quantity > 1 ? ` ×${p.quantity}` : ""}
                        </td>
                        <td className="muted">{formatDate(p.date)}</td>
                        <td className="text-end">
                          {p.amount === null ? "Not priced" : formatMinor(p.amount, currency)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} className="fw-semibold text-end" style={{ color: "var(--vmis-ink)" }}>
                        Total Paid
                      </td>
                      <td className="text-end fw-bold" style={{ color: "var(--vmis-green-700)" }}>
                        {anyUnpriced ? "≈ " : ""}
                        {formatMinor(totalPaid, currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "History" && (
          <div className="surface-card p-4">
            <h3 className="vp__card-title">VISIT HISTORY</h3>
            {visits.length === 0 ? (
              <div className="empty-state mb-0">
                <i className="bi bi-clock-history" /> No visits on this device.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Entry gate</th>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th className="text-end">Nights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((v) => (
                      <tr key={v.id}>
                        <td>{v.entry_gate}</td>
                        <td className="muted">{formatDateTime(v.entry_timestamp)}</td>
                        <td className="muted">
                          {v.exit_timestamp ? formatDateTime(v.exit_timestamp) : "In park"}
                        </td>
                        <td className="text-end">{v.nights_purchased}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="vp__actions">
          <button
            className="btn btn-ghost flex-grow-1"
            onClick={() => navigate("/register", { state: { visitor } })}
          >
            <i className="bi bi-pencil-square" /> Update Visitor
          </button>
          <button
            className={"btn vp__exit flex-grow-1" + (exiting ? " is-busy" : "")}
            onClick={onRecordExit}
            disabled={!openVisit || exiting}
          >
            <i className={"bi " + (exiting ? "bi-arrow-repeat spin" : "bi-box-arrow-right")} />{" "}
            {exiting ? "Recording…" : "Record Exit"}
          </button>
        </div>
      </div>
    </div>
  );
}
