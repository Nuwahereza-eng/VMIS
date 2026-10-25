// Last-known copy of a tourist's own bookings, kept in IndexedDB meta so the
// active ticket (QR + countdown) reopens after a refresh, a closed tab, or
// with no signal inside the park. Tagged with the owner's user id so a shared
// device never shows one tourist another's ticket; cleared on logout.

import { getMeta, setMeta } from "../db/store.js";

const KEY = "my_bookings";

export async function saveMyBookings(userId, bookings) {
  await setMeta(KEY, { userId, savedAt: new Date().toISOString(), bookings });
}

export async function loadMyBookings(userId) {
  const cached = await getMeta(KEY);
  if (!cached || cached.userId !== userId) return null;
  return cached;
}

export async function clearMyBookings() {
  await setMeta(KEY, null);
}
