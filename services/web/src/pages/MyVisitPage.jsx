import { Link } from "react-router-dom";

import { useApp } from "../context/AppContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import ActiveVisitCard from "../components/ActiveVisitCard.jsx";
import useMyBookings from "../data/useMyBookings.js";
import useNow from "../data/useNow.js";
import { pickCurrentVisit } from "../domain/visitLifecycle.js";
import {
  ATTRACTIONS,
  ENTRY_POINTS,
  FERRY,
  KEY_LOCATIONS,
  PLAN_TIPS,
  ROUTES,
  SAFETY_TIPS,
} from "../domain/parkInfo.js";

// Picks up a gate check-in within a minute of it happening.
const POLL_MS = 60 * 1000;

function gateNote(gate) {
  return ENTRY_POINTS.find((g) => g.name === gate)?.note;
}

// Routes that start or end at the tourist's gate first, then the rest.
function routesFor(gate) {
  const word = gate ? gate.split(" ")[0] : null;
  if (!word) return ROUTES;
  return [...ROUTES].sort((a, b) => Number(b.includes(word)) - Number(a.includes(word)));
}

function InfoCard({ icon, title, children }) {
  return (
    <div className="surface-card p-4">
      <h3 className="visit-info__title">
        <i className={"bi " + icon} /> {title}
      </h3>
      {children}
    </div>
  );
}

function InParkContext({ booking, stage }) {
  const gate = booking.entry_gate || booking.expected_gate;
  const note = gate && gateNote(gate);

  return (
    <div className="d-flex flex-column gap-3">
      <InfoCard icon="bi-door-open" title={stage === "paid" ? "Your entry gate" : "Gate & arrival"}>
        <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
          {gate || "Any park gate"}
        </div>
        {note && <p className="muted small mb-2">{note}</p>}
        <p className="muted small mb-0">
          {stage === "paid"
            ? "A gate officer scans your QR to check you in — that starts your ticket clock."
            : "Keep your QR handy: it is scanned at internal checkpoints and again when you exit."}
        </p>
      </InfoCard>

      {stage === "paid" ? (
        <InfoCard icon="bi-list-check" title="Before you arrive">
          <ul className="visit-list">
            {PLAN_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </InfoCard>
      ) : (
        <InfoCard icon="bi-shield-check" title="Safety reminders">
          <ul className="visit-list visit-list--icons">
            {SAFETY_TIPS.map((tip) => (
              <li key={tip.text}>
                <i className={"bi " + tip.icon} />
                <span>{tip.text}</span>
              </li>
            ))}
          </ul>
        </InfoCard>
      )}

      <InfoCard icon="bi-signpost-split" title="Suggested routes">
        <ul className="visit-list">
          {routesFor(gate).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="muted small mb-0">
          <i className="bi bi-info-circle" /> {FERRY.name}: {FERRY.note}
        </p>
      </InfoCard>

      <InfoCard icon="bi-stars" title="Park highlights">
        <div className="visit-highlights">
          {ATTRACTIONS.slice(0, 4).map((a) => (
            <div key={a.name} className="visit-highlight">
              <img src={a.image} alt="" loading="lazy" />
              <div>
                <div className="fw-semibold" style={{ color: "var(--vmis-ink)", fontSize: "0.92rem" }}>
                  {a.name}
                </div>
                <div className="muted small">{a.note}</div>
              </div>
            </div>
          ))}
        </div>
      </InfoCard>

      <InfoCard icon="bi-geo-alt" title="Key locations">
        <ul className="visit-list visit-list--icons">
          {KEY_LOCATIONS.map((l) => (
            <li key={l.name}>
              <i className={"bi " + l.icon} />
              <span>
                <strong>{l.name}</strong> — {l.note}
              </span>
            </li>
          ))}
        </ul>
      </InfoCard>
    </div>
  );
}

// The tourist's live visit dashboard: the one ticket that matters right now
// (touring, expired-but-inside, or next up for the gate), with its countdown,
// QR, and in-park context. Works from the device cache when offline.
export default function MyVisitPage() {
  const { online } = useApp();
  const { bookings, savedAt, loading, error, reload } = useMyBookings({ pollMs: POLL_MS });
  const now = useNow(1000);

  const current = pickCurrentVisit(bookings, now);

  return (
    <>
      <PageHeader
        icon="bi-compass"
        title="My visit"
        subtitle="Your live ticket, countdown, and park guide while you tour"
        actions={
          <div className="d-flex gap-2">
            <Link to="/my-bookings" className="btn btn-outline-success btn-sm">
              <i className="bi bi-journal-check" /> All bookings
            </Link>
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={reload}
              disabled={!online}
              title={online ? "Check for updates" : "Offline"}
            >
              <i className="bi bi-arrow-clockwise" /> Refresh
            </button>
          </div>
        }
      />

      {!online && (
        <div className="alert alert-warning py-2">
          <i className="bi bi-wifi-off" /> You are offline — showing your saved ticket
          {savedAt ? ` (last updated ${new Date(savedAt).toLocaleString()})` : ""}. The countdown
          keeps running.
        </div>
      )}
      {error && online && <div className="alert alert-danger py-2">{error}</div>}

      {loading && bookings.length === 0 ? (
        <div className="surface-card p-4 text-center muted">Loading…</div>
      ) : !current ? (
        <div className="empty-state surface-card p-5 text-center">
          <div className="mb-3" style={{ fontSize: "2.5rem", color: "var(--vmis-muted)" }}>
            <i className="bi bi-ticket-perforated" />
          </div>
          <h3 style={{ color: "var(--vmis-ink)" }}>No active visit</h3>
          <p className="muted mb-4">
            Once you have paid for a booking, your ticket and live visit status appear here.
          </p>
          <div className="d-flex gap-2 justify-content-center flex-wrap">
            <Link to="/book" className="btn btn-success">
              <i className="bi bi-calendar-plus" /> Book a visit
            </Link>
            <Link to="/my-bookings" className="btn btn-outline-success">
              <i className="bi bi-journal-check" /> My bookings
            </Link>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          <div className="col-lg-6 col-xl-5">
            <ActiveVisitCard
              booking={current.booking}
              stage={current.stage}
              expiresAt={current.expiresAt}
              remainingSeconds={current.remainingSeconds}
            />
          </div>
          <div className="col-lg-6 col-xl-7">
            <InParkContext booking={current.booking} stage={current.stage} />
          </div>
        </div>
      )}
    </>
  );
}
