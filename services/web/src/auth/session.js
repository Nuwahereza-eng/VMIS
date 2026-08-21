// Session storage. The JWT and the officer's identity (role, station) live in
// IndexedDB meta so they survive a reload and are available offline for the UI
// to scope what an officer may do. RBAC is still enforced server-side on every
// sync; this is only for presentation and local queueing.

import { getMeta, setMeta } from "../db/store.js";

const SESSION_KEY = "session";

// Decode a JWT payload without verifying (verification is the server's job).
export function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function saveSession(token) {
  const claims = decodeJwt(token) || {};
  const session = {
    token,
    username: claims.sub || null,
    role: claims.role || null,
    stationId: claims.station_id || null,
    exp: claims.exp || null,
  };
  await setMeta(SESSION_KEY, session);
  return session;
}

export async function loadSession() {
  return (await getMeta(SESSION_KEY)) || null;
}

export async function clearSession() {
  await setMeta(SESSION_KEY, null);
}

export function isExpired(session, now = Date.now()) {
  if (!session || !session.exp) return true;
  return now >= session.exp * 1000;
}
