import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the API client so the flush test is deterministic and offline-safe.
vi.mock("../src/api/client.js", () => ({
  syncBatch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { syncBatch } from "../src/api/client.js";
import { resetDb } from "../src/db/store.js";
import { enqueue, flush, pending, pendingCount } from "../src/sync/queue.js";

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

describe("outbound sync queue (build prompt section 5)", () => {
  it("orders operations so parents apply before children", async () => {
    await enqueue("visit_exit", { exit_gate: "G" }, "visit-1");
    await enqueue("visitor_activity", { id: "a1" });
    await enqueue("visit", { id: "visit-1" });
    await enqueue("visitor", { id: "vis-1" });

    const ordered = (await pending()).map((o) => o.entity_type);
    expect(ordered).toEqual(["visitor", "visit", "visitor_activity", "visit_exit"]);
  });

  it("drops acknowledged ops and keeps the outbox empty on full success", async () => {
    await enqueue("visitor", { id: "vis-1" });
    await enqueue("visit", { id: "visit-1" });
    const ops = await pending();

    syncBatch.mockResolvedValueOnce({
      processed: 2,
      applied: 2,
      duplicates: 0,
      conflicts: 0,
      results: ops.map((o) => ({ op_id: o.op_id, result: "applied" })),
    });

    const summary = await flush("token", "GATE-A");
    expect(summary.applied).toBe(2);
    expect(summary.remaining).toBe(0);
    expect(await pendingCount()).toBe(0);
  });

  it("is safe to retry: a re-sent op the server already applied is not duplicated", async () => {
    const op = await enqueue("visitor", { id: "vis-1" });

    // First flush: server never acknowledges (simulated mid-flight failure),
    // so the op stays queued.
    syncBatch.mockResolvedValueOnce({
      processed: 0,
      applied: 0,
      duplicates: 0,
      conflicts: 0,
      results: [],
    });
    await flush("token", "GATE-A");
    expect(await pendingCount()).toBe(1);

    // Retry: same op_id, server reports it as a duplicate. It is now cleared,
    // and crucially the op_id is unchanged so no second record was created.
    syncBatch.mockResolvedValueOnce({
      processed: 1,
      applied: 0,
      duplicates: 1,
      conflicts: 0,
      results: [{ op_id: op.op_id, result: "duplicate" }],
    });
    const summary = await flush("token", "GATE-A");
    expect(summary.duplicates).toBe(1);
    expect(await pendingCount()).toBe(0);

    // Both attempts sent the identical op_id.
    const firstBatch = syncBatch.mock.calls[0][2];
    const secondBatch = syncBatch.mock.calls[1][2];
    expect(firstBatch[0].op_id).toBe(secondBatch[0].op_id);
  });

  it("clears conflicts too (the server logged them in its exceptions list)", async () => {
    const op = await enqueue("visit_exit", { exit_gate: "G" }, "visit-1");
    syncBatch.mockResolvedValueOnce({
      processed: 1,
      applied: 0,
      duplicates: 0,
      conflicts: 1,
      results: [{ op_id: op.op_id, result: "conflict", exception_kind: "contradictory_exit" }],
    });
    const summary = await flush("token", "GATE-A");
    expect(summary.conflicts).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it("does not call the server when nothing is queued", async () => {
    const summary = await flush("token", "GATE-A");
    expect(summary.processed).toBe(0);
    expect(syncBatch).not.toHaveBeenCalled();
  });
});
