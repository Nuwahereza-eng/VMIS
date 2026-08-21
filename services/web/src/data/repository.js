// Repository: the write path every feature uses. A write lands in the local
// IndexedDB store AND appends a sync operation to the outbox, atomically from
// the UI's point of view, so the app is fully usable offline and the server
// receives the same delta later. Reads come straight from the local store.

import { STORES, get, getAll, getAllByIndex, put } from "../db/store.js";
import { enqueue } from "../sync/queue.js";
import { uuid4 } from "../domain/ids.js";
import { CATEGORY_CURRENCY } from "../domain/categories.js";

function nowIso() {
  return new Date().toISOString();
}

// --- Visitors ---

export async function registerVisitor(input, station) {
  const id = input.id || uuid4();
  const record = {
    id,
    full_name: input.full_name,
    id_number: input.id_number,
    nationality: input.nationality || null,
    category: input.category,
    privacy_notice_accepted: Boolean(input.privacy_notice_accepted),
    origin_station_id: station || null,
    client_created_at: nowIso(),
    synced: false,
  };
  await put(STORES.visitors, record);
  await enqueue("visitor", {
    id: record.id,
    full_name: record.full_name,
    id_number: record.id_number,
    nationality: record.nationality,
    category: record.category,
    privacy_notice_accepted: record.privacy_notice_accepted,
    origin_station_id: record.origin_station_id,
    client_created_at: record.client_created_at,
  });
  return record;
}

export async function getVisitor(id) {
  return get(STORES.visitors, id);
}

export async function allVisitors() {
  return getAll(STORES.visitors);
}

// Offline QR/id verification against the LOCAL record (build prompt section
// 4.1: "verifiable against the local record when the station is offline").
export async function verifyLocal(payload) {
  const direct = await get(STORES.visitors, payload);
  if (direct) return direct;
  const byNumber = await getAllByIndex(STORES.visitors, "id_number", payload);
  return byNumber[0] || null;
}

// Non-blocking duplicate check mirroring the server (id_number + name).
export async function findDuplicates(idNumber, fullName, excludeId = null) {
  const matches = await getAllByIndex(STORES.visitors, "id_number", idNumber);
  return matches.filter(
    (v) => v.id !== excludeId && v.full_name.trim().toLowerCase() === fullName.trim().toLowerCase(),
  );
}

// --- Visits (entry / exit) ---

export async function recordEntry(input, station) {
  const id = input.id || uuid4();
  const record = {
    id,
    visitor_id: input.visitor_id,
    entry_gate: input.entry_gate || station || "UNKNOWN",
    entry_timestamp: input.entry_timestamp || nowIso(),
    ticket_number: input.ticket_number,
    nights_purchased: input.nights_purchased,
    exit_gate: null,
    exit_timestamp: null,
    origin_station_id: station || null,
    client_created_at: nowIso(),
    synced: false,
  };
  await put(STORES.visits, record);
  await enqueue("visit", {
    id: record.id,
    visitor_id: record.visitor_id,
    entry_gate: record.entry_gate,
    entry_timestamp: record.entry_timestamp,
    ticket_number: record.ticket_number,
    nights_purchased: record.nights_purchased,
    origin_station_id: record.origin_station_id,
    client_created_at: record.client_created_at,
  });
  return record;
}

export async function recordExit(visitId, input, station) {
  const record = await get(STORES.visits, visitId);
  if (!record) throw new Error("Visit not found locally");
  record.exit_gate = input.exit_gate || station || "UNKNOWN";
  record.exit_timestamp = input.exit_timestamp || nowIso();
  await put(STORES.visits, record);
  await enqueue(
    "visit_exit",
    { exit_gate: record.exit_gate, exit_timestamp: record.exit_timestamp },
    record.id,
  );
  return record;
}

export async function openVisits() {
  const all = await getAll(STORES.visits);
  return all.filter((v) => !v.exit_timestamp);
}

export async function visitsForVisitor(visitorId) {
  return getAllByIndex(STORES.visits, "visitor_id", visitorId);
}

// --- Activities ---
// The client stores the visitor's category so the line is self-describing, but
// deliberately does NOT compute or send a fee: the server recomputes revenue
// authoritatively on merge (build prompt section 4.1). We record intent only.

export async function captureActivity(visitorId, activityId, quantity, category, station) {
  const id = uuid4();
  const record = {
    id,
    visitor_id: visitorId,
    activity_id: activityId,
    category,
    quantity: quantity || 1,
    currency: CATEGORY_CURRENCY[category] || null,
    origin_station_id: station || null,
    client_created_at: nowIso(),
    synced: false,
  };
  await put(STORES.activities, record);
  await enqueue("visitor_activity", {
    id: record.id,
    visitor_id: record.visitor_id,
    activity_id: record.activity_id,
    quantity: record.quantity,
    origin_station_id: record.origin_station_id,
    client_created_at: record.client_created_at,
  });
  return record;
}

export async function activitiesForVisitor(visitorId) {
  return getAllByIndex(STORES.activities, "visitor_id", visitorId);
}

export async function recordAccommodation(visitorId, facility, nights) {
  const id = uuid4();
  const record = {
    id,
    visitor_id: visitorId,
    facility,
    nights,
    client_created_at: nowIso(),
    synced: false,
  };
  await put(STORES.accommodations, record);
  await enqueue("accommodation", {
    id: record.id,
    visitor_id: record.visitor_id,
    facility: record.facility,
    nights: record.nights,
    client_created_at: record.client_created_at,
  });
  return record;
}
