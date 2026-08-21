// Offline-first local store (build prompt Table 5: IndexedDB in browser
// clients). Every write goes here first so the app works with no network;
// an outbound queue (see sync/queue.js) later replays these writes to the
// server. Station-generated UUIDs are the primary keys so two offline clients
// never collide (build prompt sections 4.1, 9).

import { openDB } from "idb";

export const DB_NAME = "vmis";
export const DB_VERSION = 1;

// Object stores mirror the server's syncable entities plus the outbound queue.
export const STORES = {
  visitors: "visitors",
  visits: "visits",
  activities: "activities", // captured VisitorActivity lines
  accommodations: "accommodations",
  outbox: "outbox", // pending sync operations
  meta: "meta", // key/value: session, last-sync, etc.
};

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.visitors)) {
          const s = db.createObjectStore(STORES.visitors, { keyPath: "id" });
          s.createIndex("id_number", "id_number");
        }
        if (!db.objectStoreNames.contains(STORES.visits)) {
          const s = db.createObjectStore(STORES.visits, { keyPath: "id" });
          s.createIndex("visitor_id", "visitor_id");
        }
        if (!db.objectStoreNames.contains(STORES.activities)) {
          const s = db.createObjectStore(STORES.activities, { keyPath: "id" });
          s.createIndex("visitor_id", "visitor_id");
        }
        if (!db.objectStoreNames.contains(STORES.accommodations)) {
          const s = db.createObjectStore(STORES.accommodations, { keyPath: "id" });
          s.createIndex("visitor_id", "visitor_id");
        }
        if (!db.objectStoreNames.contains(STORES.outbox)) {
          // op_id is the idempotency key the server dedupes on.
          db.createObjectStore(STORES.outbox, { keyPath: "op_id" });
        }
        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export async function put(storeName, value) {
  const db = await getDb();
  await db.put(storeName, value);
  return value;
}

export async function get(storeName, key) {
  const db = await getDb();
  return db.get(storeName, key);
}

export async function getAll(storeName) {
  const db = await getDb();
  return db.getAll(storeName);
}

export async function getAllByIndex(storeName, indexName, value) {
  const db = await getDb();
  return db.getAllFromIndex(storeName, indexName, value);
}

export async function del(storeName, key) {
  const db = await getDb();
  await db.delete(storeName, key);
}

export async function clearStore(storeName) {
  const db = await getDb();
  await db.clear(storeName);
}

// meta helpers (session token, last-sync timestamp).
export async function setMeta(key, value) {
  return put(STORES.meta, { key, value });
}

export async function getMeta(key) {
  const row = await get(STORES.meta, key);
  return row ? row.value : undefined;
}

// Test/reset helper: wipe everything.
export async function resetDb() {
  for (const name of Object.values(STORES)) {
    await clearStore(name);
  }
}
