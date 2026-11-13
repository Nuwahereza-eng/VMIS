// Visitor tour tracking on the phone (VMIS tracking feature, section 6).
// All coordinates are synthetic offsets around 0,0 (open Atlantic).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDb } from "../src/db/store.js";
import { distanceM, nearbyCheck, shouldRecord, sortByDistance } from "../src/domain/geo.js";
import { enqueue, flush, flushTour, pending, pendingCount } from "../src/sync/queue.js";
import { applyServerState, pointsFor, recordPoint, setConsent, startLocalTour } from "../src/tour/tourStore.js";

// ~111 m per 0.001 degree of latitude.
const at = (lat, lng = 0) => ({ latitude: lat, longitude: lng });
const MIN = 60000;

const POIS = [
  { id: "a", name: "Synthetic A", kind: "facility", latitude: 0.0, longitude: 0.0, radius_m: 150, is_active: true },
  { id: "b", name: "Synthetic B", kind: "activity", latitude: 0.005, longitude: 0.0, radius_m: 100, is_active: true },
  { id: "c", name: "Synthetic C", kind: "facility", latitude: 0.02, longitude: 0.0, radius_m: 300, is_active: true },
  { id: "x", name: "Inactive", kind: "facility", latitude: 0.003, longitude: 0.0, radius_m: 5000, is_active: false },
];

function walk(path, { repeatMs = 60 * MIN, stepMs = 2 * MIN } = {}) {
  let alertedAt = {};
  const shown = [];
  path.forEach((p, i) => {
    const position = { ...p, recorded_at: new Date(Date.UTC(2026, 0, 1, 8) + i * stepMs).toISOString() };
    const result = nearbyCheck({ pois: POIS, position, alertedAt, repeatMs });
    alertedAt = result.alertedAt;
    shown.push(...result.alerts.map((a) => a.id));
  });
  return shown;
}

describe("nearby check (no network)", () => {
  it("alerts exactly for the radii the synthetic path passes through", () => {
    const path = [
      at(-0.01), // far from everything
      at(0.0005), // ~55 m from A: inside A
      at(0.0025), // between A and B: inside neither
      at(0.0049), // ~11 m from B: inside B
      at(0.012), // between B and C
      at(0.0195), // ~55 m from C: inside C
      at(0.03), // past C
    ];
    expect(walk(path)).toEqual(["a", "b", "c"]);
  });

  it("never alerts for inactive points, whatever the radius", () => {
    expect(walk([at(0.003)])).toEqual([]);
  });

  it("stays silent when the path only skirts a radius", () => {
    // B's radius is 100 m; 0.0062 is ~133 m away.
    expect(walk([at(0.0062), at(0.0063)])).toEqual([]);
  });
});

describe("no repeat alerts", () => {
  it("alerts once while staying inside a radius within the repeat period", () => {
    const loiter = Array.from({ length: 20 }, () => at(0.0001)); // 20 fixes, 2 min apart = 38 min
    expect(walk(loiter)).toEqual(["a"]);
  });

  it("alerts again once the repeat period has passed", () => {
    const loiter = Array.from({ length: 40 }, () => at(0.0001)); // 78 min inside A
    expect(walk(loiter, { repeatMs: 60 * MIN })).toEqual(["a", "a"]);
  });
});

describe("sampling", () => {
  const last = { ...at(0), recorded_at: "2026-01-01T08:00:00Z" };
  const cfg = { minDistanceM: 100, minIntervalS: 120 };

  it("records after 100 m or 2 minutes, not before", () => {
    expect(shouldRecord(null, { ...at(0), recorded_at: last.recorded_at }, cfg)).toBe(true);
    expect(shouldRecord(last, { ...at(0.0005), recorded_at: "2026-01-01T08:00:30Z" }, cfg)).toBe(false); // 55 m, 30 s
    expect(shouldRecord(last, { ...at(0.001), recorded_at: "2026-01-01T08:00:30Z" }, cfg)).toBe(true); // 111 m
    expect(shouldRecord(last, { ...at(0), recorded_at: "2026-01-01T08:02:00Z" }, cfg)).toBe(true); // 2 min
  });

  it("measures distance and sorts nearest first", () => {
    expect(Math.round(distanceM(at(0), at(0.001)))).toBe(111);
    expect(sortByDistance(POIS.slice(0, 3), at(0.019)).map((p) => p.id)).toEqual(["c", "b", "a"]);
  });
});

describe("phone storage and upload", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores zero points when consent is declined", async () => {
    let tour = await startLocalTour({ identifier: "MF-SYNTH" });
    tour = await setConsent(tour, false);
    await expect(recordPoint(tour, at(0.001), new Date().toISOString())).rejects.toThrow(/consent/i);
    expect(await pointsFor(tour.session.id)).toEqual([]);
    expect((await pending("tour")).map((o) => o.entity_type)).toEqual(["session_consent"]);
  });

  it("keeps every point recorded offline and uploads them all on reconnect", async () => {
    let tour = await startLocalTour({ identifier: "MF-SYNTH" });
    tour = await setConsent(tour, true);
    // Offline: 25 fixes recorded, nothing sent.
    for (let i = 0; i < 25; i++) {
      tour = await recordPoint(tour, at(0.001 * i), new Date(Date.UTC(2026, 0, 1, 8, i * 2)).toISOString());
    }
    expect(await pointsFor(tour.session.id)).toHaveLength(25);
    expect(await pendingCount("tour")).toBe(26); // consent + 25 points

    // Reconnect: the first upload attempt fails mid-way, then succeeds.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(async (_url, init) => {
        const ops = JSON.parse(init.body).operations;
        return new Response(
          JSON.stringify({ processed: ops.length, applied: ops.length, duplicates: 0, conflicts: 0, results: ops.map((o) => ({ op_id: o.op_id, entity_type: o.entity_type, result: "applied" })) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(flushTour("tour-token")).rejects.toBeTruthy();
    expect(await pendingCount("tour")).toBe(26); // nothing lost

    const result = await flushTour("tour-token");
    expect(result.processed).toBe(26);
    expect(await pendingCount("tour")).toBe(0);
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body).operations;
    expect(new Set(sent.filter((o) => o.entity_type === "location_point").map((o) => o.payload.id)).size).toBe(25);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/tour\/sync$/);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer tour-token");
  });

  it("re-points queued data when the server already had a session for the ticket", async () => {
    let tour = await startLocalTour({ identifier: "MF-SYNTH" });
    tour = await setConsent(tour, true);
    tour = await recordPoint(tour, at(0.001), new Date().toISOString());
    const serverId = "11111111-2222-4333-8444-555555555555";
    tour = await applyServerState(tour, {
      token: "t",
      token_expires_at: "2026-01-02T00:00:00Z",
      session: { id: serverId, gate: null, started_at: "2026-01-01T08:00:00Z", ended_at: null, end_reason: null, consent_given: true, consent_at: null },
      ticket: { kind: "booking", holder_name: "Synthetic", nights: 1 },
      points_of_interest: [],
      settings: { min_distance_m: 100, min_interval_s: 120, poi_repeat_minutes: 60 },
    });
    expect(tour.session.id).toBe(serverId);
    const ops = await pending("tour");
    expect(ops.find((o) => o.entity_type === "location_point").payload.session_id).toBe(serverId);
    expect(ops.find((o) => o.entity_type === "session_consent").entity_id).toBe(serverId);
    expect(await pointsFor(serverId)).toHaveLength(1);
  });

  it("keeps staff and visitor uploads apart in the shared outbox", async () => {
    let tour = await startLocalTour({ identifier: "MF-SYNTH" });
    tour = await setConsent(tour, true);
    await enqueue("visitor", { id: "v1" });
    expect((await pending()).map((o) => o.entity_type)).toEqual(["visitor"]);
    expect((await pending("tour")).map((o) => o.entity_type)).toEqual(["session_consent"]);

    const fetchMock = vi.fn(async (_url, init) => {
      const ops = JSON.parse(init.body).operations;
      return new Response(JSON.stringify({ processed: ops.length, applied: ops.length, duplicates: 0, conflicts: 0, results: ops.map((o) => ({ op_id: o.op_id, result: "applied" })) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await flush("staff-token", "GATE-A");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/sync\/batch$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).operations.map((o) => o.entity_type)).toEqual(["visitor"]);
    expect(await pendingCount("tour")).toBe(1);
  });
});
