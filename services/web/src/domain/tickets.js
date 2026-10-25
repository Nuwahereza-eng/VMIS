// Ticket validity mirror of the server engine (build prompt Table 4) so an
// offline client can show a ticket's status without a round trip:
//
//   expiry = entry_timestamp + (nights_purchased x 24h)
//   status = "Active" if now < expiry else "Expired"
//
// The server remains authoritative; this is display-only. All arithmetic is
// in UTC milliseconds so a device's local timezone cannot skew the result.

export const HOURS = 60 * 60 * 1000;

export function computeExpiry(entryTimestamp, nightsPurchased) {
  const entryMs = new Date(entryTimestamp).getTime();
  return new Date(entryMs + nightsPurchased * 24 * HOURS);
}

export function computeValidity(entryTimestamp, nightsPurchased, now = new Date()) {
  const expiry = computeExpiry(entryTimestamp, nightsPurchased);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (nowMs < expiry.getTime()) {
    return {
      expiry,
      status: "Active",
      remainingSeconds: Math.floor((expiry.getTime() - nowMs) / 1000),
    };
  }
  return { expiry, status: "Expired", remainingSeconds: 0 };
}

// "2d 04:36:15" (drops the day part when under 24h) — the ticking clock face.
export function formatClock(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

// "1d 3h", "3h 42m", "42m" — a short human reading of time left.
export function formatDuration(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "under a minute";
}
