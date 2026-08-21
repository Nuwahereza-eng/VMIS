// Outbound sync queue (build prompt section 5, Figure 1 "Local layer"). Every
// offline write appends an operation here with a client-generated op_id. On
// reconnect the queue is flushed to POST /sync/batch, which replays the ops
// idempotently: because each op_id is the server's dedup key, a retried or
// interrupted flush creates zero duplicates. An op is only removed from the
// outbox once the server has acknowledged it (applied / exists / duplicate).
// Conflicts stay acknowledged too: the server has recorded them in its
// exceptions list, so re-sending would not help.

import { STORES, getAll, put, del } from "../db/store.js";
import { uuid4 } from "../domain/ids.js";
import { syncBatch } from "../api/client.js";

// Server-side dependency order: a parent entity must land before its children.
// Mirrors the backend's _ENTITY_RANK so a single flush of a full visitor plus
// their visit and activities applies cleanly in one batch.
const ENTITY_RANK = {
  visitor: 0,
  visit: 1,
  visitor_activity: 2,
  accommodation: 2,
  visit_exit: 3,
};

// Append an operation to the outbox. entityId is the target for mutations
// (visit_exit); for creates the payload carries its own station-generated id.
export async function enqueue(entityType, payload, entityId = null) {
  const op = {
    op_id: uuid4(),
    entity_type: entityType,
    entity_id: entityId,
    payload,
    queued_at: new Date().toISOString(),
  };
  await put(STORES.outbox, op);
  return op;
}

export async function pending() {
  const ops = await getAll(STORES.outbox);
  return ops.sort((a, b) => {
    const ra = ENTITY_RANK[a.entity_type] ?? 99;
    const rb = ENTITY_RANK[b.entity_type] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.queued_at.localeCompare(b.queued_at);
  });
}

export async function pendingCount() {
  return (await getAll(STORES.outbox)).length;
}

// Serialise the outbox to the wire shape the sync service expects.
function toWire(ops) {
  return ops.map((op) => ({
    op_id: op.op_id,
    entity_type: op.entity_type,
    entity_id: op.entity_id,
    payload: op.payload,
  }));
}

// Flush the queue. Returns a summary the UI can show. Any op the server
// acknowledges (any result at all) is dropped from the outbox; unacknowledged
// ops (network failure mid-batch) stay for the next flush.
export async function flush(token, stationId) {
  const ops = await pending();
  if (ops.length === 0) {
    return { processed: 0, applied: 0, duplicates: 0, conflicts: 0, remaining: 0 };
  }

  const result = await syncBatch(token, stationId, toWire(ops));

  const acknowledged = new Set((result.results || []).map((r) => r.op_id));
  for (const op of ops) {
    if (acknowledged.has(op.op_id)) {
      await del(STORES.outbox, op.op_id);
    }
  }

  return {
    processed: result.processed || 0,
    applied: result.applied || 0,
    duplicates: result.duplicates || 0,
    conflicts: result.conflicts || 0,
    remaining: await pendingCount(),
    results: result.results || [],
  };
}
