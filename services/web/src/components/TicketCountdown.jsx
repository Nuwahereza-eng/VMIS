import { useEffect, useState } from "react";

import { computeValidity } from "../domain/tickets.js";

// Formats a remaining-seconds count as "2d 04:36:15" (drops the day part when
// under 24h), matching the "Remaining Time" panel in the spec mock-up.
function formatRemaining(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

// A live ticket countdown: recomputes validity every second from the entry
// time + nights so the status flips from Active to Expired on its own, exactly
// as the build prompt's Night Tracking module requires (section 8.F).
export default function TicketCountdown({ entryTimestamp, nightsPurchased }) {
  const [validity, setValidity] = useState(() =>
    computeValidity(entryTimestamp, nightsPurchased),
  );

  useEffect(() => {
    setValidity(computeValidity(entryTimestamp, nightsPurchased));
    const id = setInterval(() => {
      setValidity(computeValidity(entryTimestamp, nightsPurchased));
    }, 1000);
    return () => clearInterval(id);
  }, [entryTimestamp, nightsPurchased]);

  const active = validity.status === "Active";

  return (
    <div
      className="mt-3 p-3 d-flex align-items-center gap-3"
      style={{
        borderRadius: "var(--vmis-radius-sm)",
        background: active ? "var(--vmis-green-50)" : "#fbeceb",
      }}
    >
      <i
        className={"bi " + (active ? "bi-stopwatch" : "bi-shield-exclamation")}
        style={{ fontSize: "1.6rem", color: active ? "var(--vmis-green-600)" : "var(--vmis-danger)" }}
      />
      <div>
        <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
          Ticket {validity.status}
          {active && (
            <span
              className="ms-2"
              style={{ fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}
            >
              {formatRemaining(validity.remainingSeconds)}
            </span>
          )}
        </div>
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          Expires {validity.expiry.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
