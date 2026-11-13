import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import OsmMap from "../components/OsmMap.jsx";
import QrScanner from "../components/QrScanner.jsx";
import { sortByDistance } from "../domain/geo.js";
import { formatDuration } from "../domain/tickets.js";
import { pendingCount } from "../sync/queue.js";
import { clearTour, loadTour, setConsent, startLocalTour } from "../tour/tourStore.js";
import { TourLinkRejected, syncTour } from "../tour/tourSync.js";
import useTourTracker from "../tour/useTourTracker.js";
import useNow from "../data/useNow.js";

const SYNC_EVERY_MS = 60 * 1000;
const SHORT_CODE = /^VM-?[0-9A-F]{8}$/i;

const STATUS = {
  on: { label: "Tracking on", icon: "bi-broadcast", cls: "green", note: "Recording your location while this page is open." },
  waiting: { label: "Finding you…", icon: "bi-hourglass-split", cls: "info", note: "Waiting for your phone's location." },
  paused: { label: "Tracking paused", icon: "bi-pause-circle", cls: "gold", note: "Location is only recorded while this page is open and on screen." },
  off: { label: "Tracking off", icon: "bi-geo-alt", cls: "neutral", note: "You chose not to share your location. Everything else still works." },
  denied: { label: "Location blocked", icon: "bi-slash-circle", cls: "expired", note: "Your browser blocked location. Allow it in the browser settings to turn tracking on." },
  ended: { label: "Visit ended", icon: "bi-flag", cls: "neutral", note: "Tracking has stopped." },
};

// Read the per-visitor link from the URL fragment (never sent to a server):
//   #t=<signed token>   or   #v=<visitor id>   (officer screen was offline)
function linkFromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return { token: params.get("t"), visitorId: params.get("v") };
}

function formatDistance(m) {
  if (m == null) return "";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function LinkForm({ gate, onLinked }) {
  const [code, setCode] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const needsId = SHORT_CODE.test(code.trim());

  async function link(identifier) {
    setBusy(true);
    setError(null);
    try {
      const tour = await startLocalTour({ identifier: identifier.trim(), idNumber: idNumber.trim() || null, gate });
      onLinked(tour);
    } catch (err) {
      setError(err?.message || "Could not start your visit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tour-card">
      <h2>Start your visit</h2>
      <p className="muted">
        Scan the QR on your ticket, or type your ticket or visitor code.
        {gate ? ` You are at ${gate}.` : ""}
      </p>
      {scanning ? (
        <div className="mb-3">
          <QrScanner
            onDecode={(text) => {
              setScanning(false);
              setCode(text);
              if (!SHORT_CODE.test(text.trim())) link(text);
            }}
            onError={() => setScanning(false)}
          />
        </div>
      ) : (
        <button type="button" className="btn btn-success w-100 mb-3" onClick={() => setScanning(true)}>
          <i className="bi bi-qr-code-scan" /> Scan my ticket QR
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) link(code);
        }}
      >
        <label className="form-label" htmlFor="tour-code">Ticket or visitor code</label>
        <input id="tour-code" className="form-control mb-2" placeholder="MF-… or VM-…" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
        {needsId && (
          <>
            <label className="form-label" htmlFor="tour-id">Passport or ID number</label>
            <input id="tour-id" className="form-control mb-2" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required autoComplete="off" />
          </>
        )}
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <button className="btn btn-outline-success w-100" disabled={busy || !code.trim()}>
          {busy ? "Starting…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

function ConsentScreen({ onDecide }) {
  return (
    <div className="tour-card">
      <h2>Share your location?</h2>
      <p>With your permission, this page records your location during your visit to:</p>
      <ul className="tour-list">
        <li>tell you about facilities and activities near you</li>
        <li>let park management see where visitors are, for your safety</li>
      </ul>
      <ul className="tour-facts">
        <li><i className="bi bi-stopwatch" /> Recorded about every 100 m or 2 minutes, only while this page is open.</li>
        <li><i className="bi bi-eye" /> Seen only by authorised park management.</li>
        <li><i className="bi bi-trash3" /> Deleted after 30 days.</li>
        <li><i className="bi bi-flag" /> Stops when you exit the park or your ticket ends.</li>
      </ul>
      <div className="d-grid gap-2">
        <button type="button" className="btn btn-success" onClick={() => onDecide(true)}>
          Allow location
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={() => onDecide(false)}>
          No thanks — continue without tracking
        </button>
      </div>
    </div>
  );
}

export default function TourPage() {
  const { gate: gateParam } = useParams();
  const location = useLocation();
  const gate = gateParam ? decodeURIComponent(gateParam) : null;
  const [tour, setTour] = useState(undefined); // undefined = loading
  const [alert, setAlert] = useState(null);
  const [linkError, setLinkError] = useState(null);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const now = useNow(30000);

  const onAlert = useCallback((poi) => setAlert(poi), []);
  const { position, status, paused, setPaused } = useTourTracker(tour || null, setTour, onAlert);

  // Resume a tour saved on this phone, or start one from a per-visitor link.
  useEffect(() => {
    (async () => {
      const saved = await loadTour();
      const { token, visitorId } = linkFromHash(location.hash);
      if ((token || visitorId) && !(saved && !saved.session.ended_at && (saved.token === token || saved.identifier === visitorId))) {
        const fresh = await startLocalTour({ token, identifier: visitorId, gate });
        window.history.replaceState(null, "", window.location.pathname);
        setTour(fresh);
        return;
      }
      setTour(saved);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Background catch-up with the server; the tour never waits on it.
  const sync = useCallback(async () => {
    const current = await loadTour();
    if (!current || !navigator.onLine) {
      setQueued(await pendingCount("tour"));
      return;
    }
    try {
      const { tour: next } = await syncTour(current);
      setTour(next);
      setLinkError(null);
    } catch (err) {
      if (err instanceof TourLinkRejected) {
        await clearTour();
        setTour(null);
        setLinkError(err.message);
      }
    }
    setQueued(await pendingCount("tour"));
  }, []);

  useEffect(() => {
    if (!tour) return undefined;
    sync();
    const id = setInterval(sync, SYNC_EVERY_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.session.id, online]);

  // Keep the "waiting to upload" count current as points are recorded offline.
  useEffect(() => {
    pendingCount("tour").then(setQueued);
  }, [tour?.lastPoint?.id, tour?.consent?.at]);

  const nearby = useMemo(() => sortByDistance(tour?.pois || [], position || tour?.lastPoint), [tour?.pois, position, tour?.lastPoint]);

  async function decideConsent(given) {
    if (given) {
      try {
        if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
      } catch {
        /* optional */
      }
    }
    setTour(await setConsent(tour, given));
  }

  if (tour === undefined) return <div className="tour-page"><div className="tour-card">Loading…</div></div>;

  const ended = status === "ended";
  const meta = STATUS[status];
  const ticket = tour?.ticket;
  const remaining = ticket?.expires_at ? Math.max(0, Math.floor((new Date(ticket.expires_at) - now) / 1000)) : null;

  return (
    <div className="tour-page">
      <header className="tour-head">
        <img src="/icon-192.png" alt="" width={32} height={32} />
        <div>
          <div className="tour-head__park">Murchison Falls National Park</div>
          <div className="tour-head__sub">Your visit</div>
        </div>
        <span className={"pill ms-auto " + (online ? "green" : "gold")}>
          <i className={"bi " + (online ? "bi-wifi" : "bi-wifi-off")} /> {online ? "Online" : "Offline"}
        </span>
      </header>

      {!tour ? (
        <>
          {linkError && <div className="alert alert-danger">{linkError}</div>}
          <LinkForm gate={gate} onLinked={setTour} />
        </>
      ) : tour.consent === null && !ended ? (
        <ConsentScreen onDecide={decideConsent} />
      ) : (
        <>
          <div className="tour-card">
            <div className="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div className="fw-semibold" style={{ color: "var(--vmis-ink)" }}>
                  {ticket?.holder_name || "Your ticket"}
                </div>
                <div className="muted small">
                  {ticket?.ticket_code || tour.identifier || "Verifying when online"}
                  {tour.session.gate ? ` · ${tour.session.gate}` : ""}
                </div>
              </div>
              <span className={"pill " + meta.cls}>
                <i className={"bi " + meta.icon} /> {meta.label}
              </span>
            </div>
            {!tour.linked && !ended && (
              <div className="small mt-2" style={{ color: "var(--vmis-warning)" }}>
                <i className="bi bi-cloud-arrow-up" /> Your ticket will be confirmed when you have signal. Everything works meanwhile.
              </div>
            )}
            {remaining != null && !ended && (
              <div className="tour-remaining">{formatDuration(remaining)} left on your ticket</div>
            )}
            <p className="muted small mb-2 mt-2">{meta.note}</p>
            {!ended && tour.consent?.given && (
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setPaused(!paused)}>
                  <i className={"bi " + (paused ? "bi-play-fill" : "bi-pause-fill")} /> {paused ? "Resume" : "Pause"}
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => decideConsent(false)}>
                  Stop sharing location
                </button>
              </div>
            )}
            {!ended && tour.consent && !tour.consent.given && (
              <button type="button" className="btn btn-sm btn-outline-success" onClick={() => decideConsent(true)}>
                Share my location
              </button>
            )}
            {queued > 0 && (
              <div className="muted small mt-2">
                <i className="bi bi-cloud-arrow-up" /> {queued} update{queued === 1 ? "" : "s"} waiting to upload
              </div>
            )}
          </div>

          {alert && !ended && (
            <div className="tour-alert" role="alert">
              <div className="d-flex justify-content-between">
                <strong>
                  <i className={"bi " + (alert.kind === "activity" ? "bi-compass" : "bi-geo-alt-fill")} /> Near you: {alert.name}
                </strong>
                <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setAlert(null)} />
              </div>
              <div className="small">
                {alert.kind === "activity" ? "Activity" : "Facility"} · {formatDistance(alert.distance_m)} away
                {alert.opening_hours ? ` · ${alert.opening_hours}` : ""}
              </div>
              {alert.description && <div className="small mt-1">{alert.description}</div>}
            </div>
          )}

          {ended ? (
            <div className="tour-card text-center">
              <h2>Thank you for visiting</h2>
              <p className="muted mb-3">
                {tour.session.end_reason === "expired" ? "Your ticket has ended." : "Your exit has been recorded."} Location
                tracking has stopped.
              </p>
              <button
                type="button"
                className="btn btn-outline-success"
                onClick={async () => {
                  await clearTour();
                  setTour(null);
                }}
              >
                Start a new visit
              </button>
            </div>
          ) : (
            <>
              <div className="tour-card">
                <h3 className="tour-h3">Near you</h3>
                {nearby.length === 0 ? (
                  <p className="muted mb-0 small">No facilities or activities listed yet.</p>
                ) : (
                  <ul className="tour-pois">
                    {nearby.map((p) => (
                      <li key={p.id}>
                        <i className={"bi " + (p.kind === "activity" ? "bi-compass" : "bi-geo-alt-fill")} aria-hidden="true" />
                        <div>
                          <div className="fw-semibold">{p.name}</div>
                          <div className="muted small">
                            {p.kind === "activity" ? "Activity" : "Facility"}
                            {p.opening_hours ? ` · ${p.opening_hours}` : ""}
                          </div>
                          {p.description && <div className="small">{p.description}</div>}
                        </div>
                        <span className="tour-pois__dist">{formatDistance(p.distance_m)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {online && nearby.length > 0 && (
                <OsmMap
                  height={280}
                  fitKey={`${tour.session.id}-${nearby.length}`}
                  markers={[
                    ...nearby.map((p) => ({ id: p.id, latitude: p.latitude, longitude: p.longitude, label: p.name, radius_m: p.radius_m })),
                    ...(position ? [{ id: "me", latitude: position.latitude, longitude: position.longitude, label: "You", color: "#c98a1f", size: 9 }] : []),
                  ]}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

