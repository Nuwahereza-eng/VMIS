import { useEffect, useRef, useState } from "react";

import { nearbyCheck, shouldRecord } from "../domain/geo.js";
import { recordAlerts, recordPoint, saveTour } from "./tourStore.js";

// Status shown to the visitor, honestly: a web page only gets location while
// it is open and on screen. No background tracking is claimed.
//   off      no consent, so location is never read
//   waiting  asking the phone for a first position
//   on       recording while this page is open
//   paused   page hidden or paused by the visitor
//   denied   the browser refused location permission
//   ended    exit recorded or ticket expired
export function trackingStatus({ tour, watching, hasFix, paused, denied, hidden }) {
  if (!tour) return "off";
  if (tour.session.ended_at || ticketExpired(tour)) return "ended";
  if (!tour.consent?.given) return "off";
  if (denied) return "denied";
  if (paused || hidden) return "paused";
  if (!watching) return "paused";
  return hasFix ? "on" : "waiting";
}

export function ticketExpired(tour, now = new Date()) {
  const expires = tour?.ticket?.expires_at;
  return Boolean(expires && now >= new Date(expires));
}

function notify(poi) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const title = `Nearby: ${poi.name}`;
    const options = { body: poi.description || (poi.kind === "activity" ? "Activity" : "Facility"), tag: poi.id };
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(() => new Notification(title, options));
    } else {
      new Notification(title, options);
    }
  } catch {
    /* notifications are a bonus; the in-page alert always shows */
  }
}

// Watches position while the tour may track, records sampled points and raises
// nearby alerts. All of it runs on the phone with no network.
export default function useTourTracker(tour, setTour, onAlert) {
  const [watching, setWatching] = useState(false);
  const [hasFix, setHasFix] = useState(false);
  const [denied, setDenied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  const [position, setPosition] = useState(null);
  const tourRef = useRef(tour);
  const chain = useRef(Promise.resolve());

  tourRef.current = tour;

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Close the tour on this phone when the ticket expires, even offline.
  useEffect(() => {
    const expires = tour?.ticket?.expires_at;
    if (!expires || tour.session.ended_at) return undefined;
    const ms = new Date(expires) - Date.now();
    const close = () =>
      saveTour({ ...tourRef.current, session: { ...tourRef.current.session, ended_at: expires, end_reason: "expired" } }).then(setTour);
    if (ms <= 0) {
      close();
      return undefined;
    }
    const id = setTimeout(close, Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [tour?.ticket?.expires_at, tour?.session.ended_at, setTour]);

  const canTrack =
    Boolean(tour?.consent?.given) && !tour?.session.ended_at && !ticketExpired(tour) && !paused && !hidden;

  useEffect(() => {
    if (!canTrack || !("geolocation" in navigator)) {
      setWatching(false);
      return undefined;
    }
    setWatching(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setDenied(false);
        setHasFix(true);
        // A browser may hand back a cached fix taken moments before the
        // visitor agreed; never date a point earlier than their consent.
        const consentAt = tourRef.current?.consent?.at;
        const fixAt = new Date(pos.timestamp || Date.now());
        const recordedAt = consentAt && fixAt < new Date(consentAt) ? new Date(consentAt) : fixAt;
        const fix = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          recorded_at: recordedAt.toISOString(),
        };
        setPosition(fix);
        // Serialise writes so two quick fixes never race on the saved tour.
        chain.current = chain.current.then(async () => {
          let current = tourRef.current;
          if (!current?.consent?.given || current.session.ended_at) return;
          const settings = current.settings;
          const { alerts, alertedAt } = nearbyCheck({
            pois: current.pois,
            position: fix,
            alertedAt: current.alertedAt,
            repeatMs: settings.poi_repeat_minutes * 60000,
          });
          if (alerts.length) {
            current = await recordAlerts(current, alerts, alertedAt);
            alerts.forEach((poi) => {
              onAlert?.(poi);
              notify(poi);
            });
          }
          if (shouldRecord(current.lastPoint, fix, { minDistanceM: settings.min_distance_m, minIntervalS: settings.min_interval_s })) {
            current = await recordPoint(current, fix, fix.recorded_at);
          }
          tourRef.current = current;
          setTour(current);
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setDenied(true);
      },
      // Battery-friendly: no GPS-only accuracy, accept a recent cached fix.
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 60000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      setWatching(false);
    };
  }, [canTrack, setTour, onAlert]);

  return {
    position,
    status: trackingStatus({ tour, watching, hasFix, paused, denied, hidden }),
    paused,
    setPaused,
  };
}
