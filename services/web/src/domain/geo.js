// Distance, sampling and nearby checks for tour tracking. Pure functions: they
// run on the visitor's phone with no network and are unit tested with
// synthetic paths.

const EARTH_RADIUS_M = 6371000;
const rad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in metres between two { latitude, longitude } points.
export function distanceM(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Record a point when the visitor has moved at least `minDistanceM` or at
// least `minIntervalS` has passed since the last recorded point. Low battery
// and data use: everything else is dropped.
export function shouldRecord(last, position, { minDistanceM, minIntervalS }) {
  if (!last) return true;
  const elapsedS = (new Date(position.recorded_at) - new Date(last.recorded_at)) / 1000;
  if (elapsedS >= minIntervalS) return true;
  return distanceM(last, position) >= minDistanceM;
}

// Points of interest sorted nearest first, each with its distance.
export function sortByDistance(pois, position) {
  return pois
    .map((poi) => ({ ...poi, distance_m: position ? distanceM(position, poi) : null }))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}

// Which points the visitor has just come within range of. A point already
// alerted within `repeatMs` is skipped. Returns the points to alert now and the
// updated alert history ({ poiId: ISO time of last alert }).
export function nearbyCheck({ pois, position, alertedAt = {}, repeatMs, now }) {
  const at = now ? new Date(now) : new Date(position.recorded_at);
  const next = { ...alertedAt };
  const alerts = [];
  for (const poi of pois) {
    if (poi.is_active === false) continue;
    const d = distanceM(position, poi);
    if (d > poi.radius_m) continue;
    const last = next[poi.id] ? new Date(next[poi.id]) : null;
    if (last && at - last < repeatMs) continue;
    next[poi.id] = at.toISOString();
    alerts.push({ ...poi, distance_m: d });
  }
  alerts.sort((a, b) => a.distance_m - b.distance_m);
  return { alerts, alertedAt: next };
}
