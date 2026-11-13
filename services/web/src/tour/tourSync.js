// Bring a visitor phone's tour up to date with the server when a connection is
// available. Nothing in the tour waits on this: it runs in the background and
// any failure just means "try again later".
//
// 1. Not yet linked (started offline at the gate): link now, sending the local
//    session id, start time and consent so queued points stay attached.
// 2. Linked: fetch the session to learn about an exit or expiry recorded at a
//    gate, and refresh the token and points of interest.
// 3. Upload the queued consent changes, points and alerts (same outbox,
//    op_id dedup, visitor token).

import { tourLink, tourSession } from "../api/client.js";
import { flushTour } from "../sync/queue.js";
import { applyServerState, saveTour } from "./tourStore.js";

export class TourLinkRejected extends Error {}

export async function syncTour(tour) {
  let next = tour;
  try {
    if (!next.linked) {
      const state = await tourLink(
        {
          identifier: next.identifier,
          id_number: next.idNumber,
          gate: next.session.gate,
          session_id: next.session.id,
          started_at: next.session.started_at,
          consent_given: next.consent ? next.consent.given : null,
          consent_at: next.consent ? next.consent.at : null,
        },
        next.token,
      );
      next = await applyServerState(next, state);
    } else {
      next = await applyServerState(next, await tourSession(next.token));
    }
  } catch (err) {
    // The server answered and said no: wrong code, ticket ended, link expired.
    if (err?.status && err.status >= 400 && err.status < 500) {
      if (err.status === 409 && next.linked) {
        next = await saveTour({
          ...next,
          session: { ...next.session, ended_at: new Date().toISOString(), end_reason: "ended" },
        });
      } else if (!next.linked) {
        throw new TourLinkRejected(err.message);
      }
    }
    // Network trouble (status 0): stay offline; the queue keeps everything.
    return { tour: next, uploaded: 0, offline: !err?.status };
  }

  let uploaded = 0;
  try {
    const result = await flushTour(next.token);
    uploaded = result.processed || 0;
  } catch {
    /* keep queued */
  }
  return { tour: next, uploaded, offline: false };
}
