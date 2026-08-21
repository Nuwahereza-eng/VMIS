import { describe, expect, it } from "vitest";

import { computeExpiry, computeValidity, HOURS } from "../src/domain/tickets.js";

describe("ticket validity mirror (build prompt Table 4)", () => {
  const entry = "2026-01-01T08:00:00Z";

  it("expiry is entry + nights x 24h", () => {
    const expiry = computeExpiry(entry, 2);
    expect(expiry.getTime()).toBe(new Date(entry).getTime() + 48 * HOURS);
  });

  it("is Active before expiry", () => {
    const now = new Date("2026-01-02T08:00:00Z"); // 24h in, 2 nights
    const v = computeValidity(entry, 2, now);
    expect(v.status).toBe("Active");
    expect(v.remainingSeconds).toBe(24 * 60 * 60);
  });

  it("is Expired at the boundary (now == expiry)", () => {
    const expiry = computeExpiry(entry, 1);
    const v = computeValidity(entry, 1, expiry);
    expect(v.status).toBe("Expired");
    expect(v.remainingSeconds).toBe(0);
  });

  it("is Expired after expiry and never goes negative", () => {
    const now = new Date("2026-01-05T08:00:00Z");
    const v = computeValidity(entry, 1, now);
    expect(v.status).toBe("Expired");
    expect(v.remainingSeconds).toBe(0);
  });

  it("matches regardless of the device timezone offset representation", () => {
    // Same instant expressed with an offset must produce the same expiry.
    const withOffset = "2026-01-01T11:00:00+03:00"; // == 08:00Z
    expect(computeExpiry(withOffset, 2).getTime()).toBe(computeExpiry(entry, 2).getTime());
  });
});
