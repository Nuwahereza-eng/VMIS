// Tourist visit lifecycle, mirrored from the server (app/booking_lifecycle.py):
//
//   booked -> paid -> touring -> completed
//                        \-> expired (validity window ran out before check-out)
//
// The server sends `lifecycle` on every booking, but the client recomputes it
// from the raw fields so a "Touring now" card flips to "Expired" on its own,
// even offline from a cached copy. Expiry follows build prompt Table 4:
// check-in time + nights x 24h.

import { computeValidity } from "./tickets.js";

export const LIFECYCLE_META = {
  booked: { label: "Booked", cls: "gold", icon: "bi-journal-text" },
  paid: { label: "Ready for gate", cls: "info", icon: "bi-ticket-perforated" },
  touring: { label: "Touring now", cls: "green", icon: "bi-compass" },
  completed: { label: "Completed", cls: "neutral", icon: "bi-flag" },
  expired: { label: "Expired", cls: "expired", icon: "bi-shield-exclamation" },
  cancelled: { label: "Cancelled", cls: "neutral", icon: "bi-x-circle" },
  no_show: { label: "No show", cls: "expired", icon: "bi-dash-circle" },
};

// The forward journey shown as a stepper. Expired sits at the check-in step.
export const JOURNEY = [
  { key: "booked", label: "Booked" },
  { key: "paid", label: "Paid" },
  { key: "touring", label: "Checked in" },
  { key: "completed", label: "Completed" },
];

export function journeyIndex(stage) {
  if (stage === "expired") return 2;
  return JOURNEY.findIndex((s) => s.key === stage);
}

// { stage, expiresAt: Date|null, remainingSeconds: number|null }
export function lifecycleOf(booking, now = new Date()) {
  if (booking.status === "cancelled") return { stage: "cancelled", expiresAt: null, remainingSeconds: null };
  if (booking.status === "no_show") return { stage: "no_show", expiresAt: null, remainingSeconds: null };

  if (booking.arrived_at) {
    const v = computeValidity(booking.arrived_at, booking.length_of_stay_nights, now);
    if (booking.departed_at) return { stage: "completed", expiresAt: v.expiry, remainingSeconds: 0 };
    return {
      stage: v.status === "Active" ? "touring" : "expired",
      expiresAt: v.expiry,
      remainingSeconds: v.remainingSeconds,
    };
  }
  if (booking.status === "arrived") return { stage: "touring", expiresAt: null, remainingSeconds: null };
  if (booking.payment_status === "paid") return { stage: "paid", expiresAt: null, remainingSeconds: null };
  return { stage: "booked", expiresAt: null, remainingSeconds: null };
}

function todayISO(now) {
  const d = now instanceof Date ? now : new Date(now);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The one booking the "My visit" screen should focus on: a tour in progress,
// then an expired-but-not-checked-out one (the tourist is likely still inside),
// then the next paid ticket waiting for the gate. Null when none apply.
export function pickCurrentVisit(bookings, now = new Date()) {
  const withStage = bookings.map((b) => ({ booking: b, ...lifecycleOf(b, now) }));
  const touring = withStage.find((x) => x.stage === "touring");
  if (touring) return touring;
  const expired = withStage.find((x) => x.stage === "expired");
  if (expired) return expired;

  const paid = withStage
    .filter((x) => x.stage === "paid")
    .sort((a, b) => a.booking.intended_date.localeCompare(b.booking.intended_date));
  if (paid.length === 0) return null;
  const today = todayISO(now);
  return paid.find((x) => x.booking.intended_date >= today) || paid[paid.length - 1];
}
