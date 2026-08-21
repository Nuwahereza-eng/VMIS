import { beforeEach, describe, expect, it } from "vitest";

import { resetDb } from "../src/db/store.js";
import {
  activitiesForVisitor,
  captureActivity,
  findDuplicates,
  openVisits,
  recordEntry,
  recordExit,
  registerVisitor,
  verifyLocal,
} from "../src/data/repository.js";
import { pending, pendingCount } from "../src/sync/queue.js";

const VISITOR = {
  full_name: "Synthetic Visitor",
  id_number: "SYN-9001",
  nationality: "Testland",
  category: "FNR",
  privacy_notice_accepted: true,
};

beforeEach(async () => {
  await resetDb();
});

describe("offline repository writes local-first and queues a sync op", () => {
  it("registers a visitor locally and enqueues one visitor op", async () => {
    const rec = await registerVisitor(VISITOR, "GATE-A");
    expect(rec.id).toBeTruthy();
    expect(rec.origin_station_id).toBe("GATE-A");

    const local = await verifyLocal(rec.id);
    expect(local.full_name).toBe("Synthetic Visitor");

    const ops = await pending();
    expect(ops).toHaveLength(1);
    expect(ops[0].entity_type).toBe("visitor");
    expect(ops[0].payload.id).toBe(rec.id);
  });

  it("verifies against the local record by id and by id_number (offline)", async () => {
    const rec = await registerVisitor(VISITOR, "GATE-A");
    expect((await verifyLocal(rec.id)).id).toBe(rec.id);
    expect((await verifyLocal("SYN-9001")).id).toBe(rec.id);
    expect(await verifyLocal("nope")).toBeNull();
  });

  it("flags duplicates on id_number + name without blocking", async () => {
    await registerVisitor(VISITOR, "GATE-A");
    const dupes = await findDuplicates("SYN-9001", "Synthetic Visitor");
    expect(dupes).toHaveLength(1);
    const none = await findDuplicates("SYN-9001", "Different Name");
    expect(none).toHaveLength(0);
  });

  it("records entry then exit, queueing a visit and a visit_exit op", async () => {
    const visitor = await registerVisitor(VISITOR, "GATE-A");
    const visit = await recordEntry(
      { visitor_id: visitor.id, ticket_number: "TK-1", nights_purchased: 2 },
      "GATE-A",
    );
    expect((await openVisits())).toHaveLength(1);

    await recordExit(visit.id, {}, "GATE-A");
    expect((await openVisits())).toHaveLength(0);

    const types = (await pending()).map((o) => o.entity_type);
    expect(types).toContain("visitor");
    expect(types).toContain("visit");
    expect(types).toContain("visit_exit");
  });

  it("captures an activity without a client fee (server recomputes revenue)", async () => {
    const visitor = await registerVisitor(VISITOR, "STATION-1");
    await captureActivity(visitor.id, "act-123", 3, "FNR", "STATION-1");

    const lines = await activitiesForVisitor(visitor.id);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
    expect(lines[0]).not.toHaveProperty("amount_minor");

    const op = (await pending()).find((o) => o.entity_type === "visitor_activity");
    expect(op.payload).not.toHaveProperty("amount_minor");
    expect(op.payload.quantity).toBe(3);
  });

  it("keeps a stable pending count across mixed writes", async () => {
    const v = await registerVisitor(VISITOR, "GATE-A");
    await recordEntry({ visitor_id: v.id, ticket_number: "TK-2", nights_purchased: 1 }, "GATE-A");
    await captureActivity(v.id, "act-1", 1, "FNR", "GATE-A");
    expect(await pendingCount()).toBe(3);
  });
});
