import { describe, expect, it } from "vitest";

import { formatDuration } from "../src/domain/tickets.js";
import { lifecycleOf, pickCurrentVisit } from "../src/domain/visitLifecycle.js";

const base = {
  id: "b1",
  status: "pending",
  payment_status: "unpaid",
  arrived_at: null,
  departed_at: null,
  length_of_stay_nights: 1,
  intended_date: "2026-12-10",
};

describe("visit lifecycle mirror", () => {
  const now = new Date("2026-12-10T12:00:00Z");

  it("booked until paid, then paid until checked in", () => {
    expect(lifecycleOf(base, now).stage).toBe("booked");
    expect(lifecycleOf({ ...base, payment_status: "paid" }, now).stage).toBe("paid");
  });

  it("touring inside the window, with time remaining", () => {
    const b = { ...base, status: "arrived", payment_status: "paid", arrived_at: "2026-12-10T08:00:00Z" };
    const life = lifecycleOf(b, now);
    expect(life.stage).toBe("touring");
    expect(life.remainingSeconds).toBe(20 * 3600);
  });

  it("expires at check-in + nights x 24h", () => {
    const b = { ...base, status: "arrived", payment_status: "paid", arrived_at: "2026-12-09T12:00:00Z" };
    expect(lifecycleOf(b, now).stage).toBe("expired");
  });

  it("completed once checked out", () => {
    const b = {
      ...base,
      status: "arrived",
      payment_status: "paid",
      arrived_at: "2026-12-10T08:00:00Z",
      departed_at: "2026-12-10T11:00:00Z",
    };
    expect(lifecycleOf(b, now).stage).toBe("completed");
  });

  it("cancelled wins over payment", () => {
    expect(lifecycleOf({ ...base, status: "cancelled", payment_status: "paid" }, now).stage).toBe("cancelled");
  });
});

describe("pickCurrentVisit", () => {
  const now = new Date("2026-12-10T12:00:00Z");

  it("prefers a tour in progress over an upcoming paid ticket", () => {
    const upcoming = { ...base, id: "up", payment_status: "paid", intended_date: "2026-12-11" };
    const touring = { ...base, id: "t", status: "arrived", payment_status: "paid", arrived_at: "2026-12-10T08:00:00Z" };
    expect(pickCurrentVisit([upcoming, touring], now).booking.id).toBe("t");
  });

  it("picks the soonest upcoming paid ticket", () => {
    const later = { ...base, id: "later", payment_status: "paid", intended_date: "2027-01-05" };
    const sooner = { ...base, id: "sooner", payment_status: "paid", intended_date: "2026-12-12" };
    const past = { ...base, id: "past", payment_status: "paid", intended_date: "2026-11-01" };
    expect(pickCurrentVisit([later, past, sooner], now).booking.id).toBe("sooner");
  });

  it("returns null with nothing paid", () => {
    expect(pickCurrentVisit([base], now)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("reads naturally", () => {
    expect(formatDuration(3 * 3600 + 42 * 60)).toBe("3h 42m");
    expect(formatDuration(26 * 3600)).toBe("1d 2h");
    expect(formatDuration(5 * 60)).toBe("5m");
  });
});
