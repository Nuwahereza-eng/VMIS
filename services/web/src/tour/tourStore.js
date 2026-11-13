// A visitor phone's tour, kept on the phone so the tour works with no network
// after the gate: the session, the visitor link token, the ticket summary, the
// points of interest, and which points have already alerted. Location points
// are written to their own store first, then queued in the shared outbox for
// upload with the visitor token (see sync/queue.js flushTour).

import { STORES, get, getAll, getAllByIndex, getMeta, put, setMeta } from "../db/store.js";
import { uuid4 } from "../domain/ids.js";
import { enqueue } from "../sync/queue.js";

const KEY = "tour";

export const DEFAULT_SETTINGS = { min_distance_m: 100, min_interval_s: 120, poi_repeat_minutes: 60 };

export async function loadTour() {
  return (await getMeta(KEY)) || null;
}

export async function saveTour(tour) {
  await setMeta(KEY, tour);
  return tour;
}

export async function clearTour() {
  await setMeta(KEY, null);
}

// Start a tour on this phone, before (or without) the server: the session id
// is generated here so points recorded offline already belong to it.
export async function startLocalTour({ identifier = null, idNumber = null, token = null, gate = null }) {
  return saveTour({
    session: { id: uuid4(), gate, started_at: new Date().toISOString(), ended_at: null, end_reason: null },
    consent: null, // null = not asked yet; then { given, at }
    identifier,
    idNumber,
    token,
    tokenExpiresAt: null,
    ticket: null,
    pois: [],
    settings: DEFAULT_SETTINGS,
    alertedAt: {},
    linked: false,
    lastPoint: null,
  });
}

// Merge what the server said after linking (or a catch-up). If the server
// already had an open session for this ticket under another id (the ticket was
// linked from another phone), adopt it and re-point anything queued.
export async function applyServerState(tour, state) {
  let next = { ...tour };
  if (state.session.id !== tour.session.id) {
    await repointSession(tour.session.id, state.session.id);
  }
  next.session = { ...state.session };
  next.token = state.token;
  next.tokenExpiresAt = state.token_expires_at;
  next.ticket = state.ticket;
  next.pois = state.points_of_interest || [];
  next.settings = state.settings || DEFAULT_SETTINGS;
  next.linked = true;
  // The phone's own consent decision stands; the server learns it via the queue.
  return saveTour(next);
}

async function repointSession(fromId, toId) {
  for (const op of await getAll(STORES.outbox)) {
    if (op.payload?.session_id === fromId || op.entity_id === fromId) {
      const payload = op.payload?.session_id === fromId ? { ...op.payload, session_id: toId } : op.payload;
      await put(STORES.outbox, { ...op, payload, entity_id: op.entity_id === fromId ? toId : op.entity_id });
    }
  }
  for (const point of await getAllByIndex(STORES.tourPoints, "session_id", fromId)) {
    await put(STORES.tourPoints, { ...point, session_id: toId });
  }
}

export async function setConsent(tour, given) {
  const consent = { given, at: new Date().toISOString() };
  await enqueue("session_consent", { given, at: consent.at }, tour.session.id);
  return saveTour({ ...tour, consent });
}

// Save one location point on the phone, then queue it for upload. Never called
// without consent (the tracker only runs once the visitor has agreed).
export async function recordPoint(tour, coords, recordedAt) {
  if (!tour.consent?.given) throw new Error("No consent: location is not recorded");
  const point = {
    id: uuid4(),
    session_id: tour.session.id,
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy ?? null,
    recorded_at: recordedAt,
  };
  await put(STORES.tourPoints, point);
  await enqueue("location_point", point, point.id);
  return saveTour({ ...tour, lastPoint: point });
}

export async function recordAlerts(tour, alerts, alertedAt) {
  for (const poi of alerts) {
    const alert = { id: uuid4(), session_id: tour.session.id, poi_id: poi.id, shown_at: alertedAt[poi.id] };
    await enqueue("poi_alert", alert, alert.id);
  }
  return saveTour({ ...tour, alertedAt });
}

export async function pointsFor(sessionId) {
  return getAllByIndex(STORES.tourPoints, "session_id", sessionId);
}

export { get };
