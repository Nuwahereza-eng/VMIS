import { CATEGORIES } from "../domain/categories.js";
import { formatClock, formatDuration } from "../domain/tickets.js";
import { JOURNEY, LIFECYCLE_META, journeyIndex } from "../domain/visitLifecycle.js";
import useTicketQr from "./useTicketQr.js";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]));

// Under this much time left the countdown turns amber.
const WARN_SECONDS = 2 * 60 * 60;

function formatDay(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Journey({ stage }) {
  const current = journeyIndex(stage);
  return (
    <ol className="visit-journey" aria-label="Visit progress">
      {JOURNEY.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        const failed = state === "current" && stage === "expired";
        return (
          <li
            key={step.key}
            className={`visit-journey__step is-${state}${failed ? " is-expired" : ""}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="visit-journey__dot">
              {state === "done" ? <i className="bi bi-check" /> : i + 1}
            </span>
            <span className="visit-journey__label">{failed ? "Expired" : step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Status({ stage, booking, expiresAt, remainingSeconds }) {
  if (stage === "touring" && remainingSeconds != null) {
    const totalSeconds = booking.length_of_stay_nights * 24 * 3600;
    const used = Math.min(1, Math.max(0, 1 - remainingSeconds / totalSeconds));
    const warn = remainingSeconds < WARN_SECONDS;
    return (
      <div className={"visit-timer" + (warn ? " is-warn" : "")} role="timer" aria-live="off">
        <div className="visit-timer__label">
          {warn ? "Ticket expires soon" : "Active ticket"} — {formatDuration(remainingSeconds)} remaining
        </div>
        <div className="visit-timer__clock">{formatClock(remainingSeconds)}</div>
        <div className="visit-timer__bar" aria-hidden="true">
          <span style={{ width: `${used * 100}%` }} />
        </div>
        <div className="visit-timer__meta">Valid until {formatTime(expiresAt)}</div>
      </div>
    );
  }
  if (stage === "touring") {
    return (
      <div className="visit-timer">
        <div className="visit-timer__label">You are checked in</div>
        <div className="visit-timer__meta">Ask the gate officer to confirm your ticket validity.</div>
      </div>
    );
  }
  if (stage === "expired") {
    return (
      <div className="visit-timer is-expired" role="alert">
        <div className="visit-timer__label">
          <i className="bi bi-shield-exclamation" /> Ticket expired
        </div>
        <div className="visit-timer__meta">
          Your paid stay ended {formatTime(expiresAt)}. Please make your way to the nearest exit
          gate, or extend your stay with a gate officer.
        </div>
      </div>
    );
  }
  if (stage === "paid") {
    return (
      <div className="visit-timer is-idle">
        <div className="visit-timer__label">
          <i className="bi bi-signpost-2" /> Ready for the gate · {formatDay(booking.intended_date)}
        </div>
        <div className="visit-timer__meta">
          Show the QR below at {booking.expected_gate || "the entry gate"}. Your{" "}
          {booking.length_of_stay_nights * 24}h ticket clock starts when it is scanned.
        </div>
      </div>
    );
  }
  if (stage === "completed") {
    return (
      <div className="visit-timer is-idle">
        <div className="visit-timer__label">
          <i className="bi bi-flag" /> Visit complete
        </div>
        <div className="visit-timer__meta">
          Checked out {formatTime(booking.departed_at)}. Thanks for visiting Murchison Falls.
        </div>
      </div>
    );
  }
  return null;
}

// The live visit card: lifecycle badge, countdown, gate and arrival status, and
// the QR the tourist shows at checkpoints and on exit.
export default function ActiveVisitCard({ booking, stage, expiresAt, remainingSeconds }) {
  const meta = LIFECYCLE_META[stage] || LIFECYCLE_META.booked;
  const showQr = booking.ticket_code && (stage === "paid" || stage === "touring" || stage === "expired");
  const qrUrl = useTicketQr(showQr ? booking.ticket_code : null);
  const gate = booking.entry_gate || booking.expected_gate;

  return (
    <div className={`surface-card visit-card is-${stage}`}>
      <div className="visit-card__head">
        <div>
          <div className="visit-card__park">Murchison Falls National Park</div>
          <div className="visit-card__who">
            {booking.full_name} · party of {booking.party_size}
          </div>
        </div>
        <span className={`pill ${meta.cls} visit-card__badge`}>
          {stage === "touring" ? <span className="live-dot" aria-hidden="true" /> : <i className={"bi " + meta.icon} />}{" "}
          {meta.label}
        </span>
      </div>

      <Journey stage={stage} />

      <Status stage={stage} booking={booking} expiresAt={expiresAt} remainingSeconds={remainingSeconds} />

      <div className="visit-facts">
        <div className="visit-fact">
          <span className="visit-fact__label">
            <i className="bi bi-door-open" /> {booking.arrived_at ? "Entry gate" : "Expected gate"}
          </span>
          <span className="visit-fact__value">{gate || "Any gate"}</span>
        </div>
        <div className="visit-fact">
          <span className="visit-fact__label">
            <i className="bi bi-box-arrow-in-right" /> Checked in
          </span>
          <span className="visit-fact__value">
            {booking.arrived_at ? formatTime(booking.arrived_at) : "Not yet"}
          </span>
        </div>
        <div className="visit-fact">
          <span className="visit-fact__label">
            <i className="bi bi-moon-stars" /> Stay
          </span>
          <span className="visit-fact__value">
            {booking.length_of_stay_nights} night{booking.length_of_stay_nights === 1 ? "" : "s"}
          </span>
        </div>
        <div className="visit-fact">
          <span className="visit-fact__label">
            <i className="bi bi-person-badge" /> Category
          </span>
          <span className="visit-fact__value">
            {CATEGORY_LABEL[booking.category] || booking.category || "—"}
          </span>
        </div>
      </div>

      {showQr && (
        <div className="booking-ticket__qr visit-card__qr">
          {qrUrl ? (
            <img src={qrUrl} alt={`QR code for ticket ${booking.ticket_code}`} />
          ) : (
            <div className="booking-ticket__qr-fallback">
              <i className="bi bi-qr-code" />
            </div>
          )}
          <div className="booking-ticket__code">{booking.ticket_code}</div>
          <div className="booking-ticket__hint muted">
            {stage === "paid" ? "Show this QR at the gate" : "Show at checkpoints and when you exit"}
          </div>
        </div>
      )}
    </div>
  );
}
