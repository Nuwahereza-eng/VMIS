import { useCallback, useEffect, useState } from "react";

import { useApp } from "../context/AppContext.jsx";
import { getMyBookings } from "../api/client.js";
import { loadMyBookings, saveMyBookings } from "./myBookingsCache.js";

// A tourist's own bookings: served from the device cache first (so a ticket is
// on screen immediately, even offline), then refreshed from the server. With
// `pollMs`, refreshes on that interval and when the tab regains focus, so a
// gate check-in shows up without the tourist doing anything.
export default function useMyBookings({ pollMs = 0 } = {}) {
  const { session, online } = useApp();
  const token = session.token;
  const userId = session.userId;

  const [bookings, setBookingsState] = useState([]);
  const [savedAt, setSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const setBookings = useCallback(
    (updater) => {
      setBookingsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveMyBookings(userId, next).catch(() => {});
        return next;
      });
      setSavedAt(new Date().toISOString());
    },
    [userId],
  );

  const reload = useCallback(async () => {
    setError(null);
    try {
      const rows = await getMyBookings(token);
      setBookings(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err?.message || "Could not load your bookings.");
    } finally {
      setLoading(false);
    }
  }, [token, setBookings]);

  // Cached copy first.
  useEffect(() => {
    let active = true;
    loadMyBookings(userId)
      .then((cached) => {
        if (!active || !cached) return;
        setBookingsState((prev) => (prev.length ? prev : cached.bookings));
        setSavedAt((prev) => prev || cached.savedAt);
        setLoading(false);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (online) reload();
    else setLoading(false);
  }, [online, reload]);

  useEffect(() => {
    if (!pollMs || !online) return undefined;
    const id = setInterval(reload, pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollMs, online, reload]);

  return { bookings, setBookings, savedAt, loading, error, reload };
}
