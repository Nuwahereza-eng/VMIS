import { useState } from "react";

import { checkInTicket, checkOutTicket } from "../api/client.js";
import { CATEGORIES } from "../domain/categories.js";
import { GATES } from "../domain/reference.js";
import { formatDuration } from "../domain/tickets.js";
import { LIFECYCLE_META, lifecycleOf } from "../domain/visitLifecycle.js";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

// Gate officer's view of a scanned booking ticket (MF-...): who it is for, where
// it is in the visit lifecycle, and a one-tap check-in (starts the tour and the
// validity window) or check-out (completes the visit).
export default function TicketCheckInPanel({ booking: initial, token, online, stationId, onDone }) {
  const [booking, setBooking] = useState(initial);
  const [gate, setGate] = useState(
    initial.expected_gate || (GATES.includes(stationId) ? stationId : GATES[0]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);

  const life = lifecycleOf(booking);
  const meta = LIFECYCLE_META[life.stage] || LIFECYCLE_META.booked;

  async function run(action, done) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const updated = await action(token, booking.ticket_code, { gate });
      setBooking(updated);
      setNote(done);
    } catch (err) {
      setError(err?.message || "The gate action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface-card p-4 ticket-checkin">
      <div className="d-flex justify-content-between align-items-start gap-2 mb-3">
        <div>
          <div className="booking-ticket__code mt-0">{booking.ticket_code}</div>
          <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
            {booking.full_name}
          </div>
          <div className="muted small">
            Party of {booking.party_size}
            {booking.category ? ` · ${CATEGORY_LABEL[booking.category] || booking.category}` : ""}
            {` · ${booking.length_of_stay_nights} night${booking.length_of_stay_nights === 1 ? "" : "s"}`}
          </div>
        </div>
        <span className={"pill " + meta.cls}>
          <i className={"bi " + meta.icon} /> {meta.label}
        </span>
      </div>

      <div className="breakdown-list mb-3">
        <div className="data-row">
          <span className="muted">Visit date</span>
          <span>{booking.intended_date}</span>
        </div>
        <div className="data-row">
          <span className="muted">Payment</span>
          <span>{booking.payment_status === "paid" ? "Paid" : "Unpaid"}</span>
        </div>
        {booking.arrived_at && (
          <div className="data-row">
            <span className="muted">Checked in</span>
            <span>
              {formatTime(booking.arrived_at)}
              {booking.entry_gate ? ` · ${booking.entry_gate}` : ""}
            </span>
          </div>
        )}
        {life.stage === "touring" && life.remainingSeconds != null && (
          <div className="data-row">
            <span className="muted">Time left</span>
            <span>{formatDuration(life.remainingSeconds)}</span>
          </div>
        )}
        {booking.departed_at && (
          <div className="data-row">
            <span className="muted">Checked out</span>
            <span>{formatTime(booking.departed_at)}</span>
          </div>
        )}
      </div>

      {note && <div className="alert alert-success py-2">{note}</div>}
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {!online && (
        <div className="alert alert-warning py-2">Ticket check-in needs a connection to the central system.</div>
      )}

      {(life.stage === "paid" || life.stage === "touring" || life.stage === "expired") && (
        <div className="mb-3">
          <label className="form-label small">Gate</label>
          <select className="form-select" value={gate} onChange={(e) => setGate(e.target.value)}>
            {GATES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="d-grid gap-2">
        {life.stage === "paid" && (
          <button
            type="button"
            className="btn btn-success"
            disabled={busy || !online}
            onClick={() => run(checkInTicket, "Checked in — the visitor's tour has started.")}
          >
            <i className="bi bi-box-arrow-in-right" /> Check in at {gate}
          </button>
        )}
        {(life.stage === "touring" || life.stage === "expired") && (
          <button
            type="button"
            className="btn btn-outline-success"
            disabled={busy || !online}
            onClick={() => run(checkOutTicket, "Checked out — visit completed.")}
          >
            <i className="bi bi-box-arrow-right" /> Check out
          </button>
        )}
        {life.stage === "cancelled" && (
          <div className="alert alert-danger py-2 mb-0">This booking was cancelled; the ticket is void.</div>
        )}
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          <i className="bi bi-qr-code-scan" /> Scan another
        </button>
      </div>
    </div>
  );
}
