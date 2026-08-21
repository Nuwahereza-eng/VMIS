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
