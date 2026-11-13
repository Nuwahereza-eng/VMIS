# Visitor tour tracking: build notes

What was built for `VMIS_TRACKING_FEATURE_PROMPT.md`, what was not, and the
limits found. The plan was approved before coding, with eight decisions
(listed at the end).

## What was built

### Gate QR check-in
- **Gate QR:** each gate's QR opens `/tour/gate/<gate>`. Management prints one
  page per gate from **Points of Interest → Print gate QR codes**.
- **Per-visitor QR:** the visitor's ticket card (after registration or entry)
  and the booking check-in panel have **Show tour link QR**. It opens
  `/tour#t=<token>`, already linked to that ticket. The token sits in the URL
  fragment, so it is never sent to a server or written to access logs.
- **Linking from the gate QR:** the visitor scans or types their ticket. Accepted:
  - the visitor QR (`VMIS:1:<id>`, or the older bare-id form)
  - a booking code (`MF-…`)
  - a short visitor code (`VM-…`), which also needs the passport/ID number
- **Session:** one open session per ticket, enforced in code and by a partial
  unique index (checked on PostgreSQL). Linking the same ticket again joins the
  existing session.
- **Offline at the gate:**
  - The page opens from the installed app's offline cache, creates the session
    on the phone and records points.
  - It links and uploads when signal returns, keeping its session id.
  - If the ticket was already linked from another phone, the phone adopts that
    session and re-points its queued data.
  - Tested in headless Chrome with the network off from page load onward.
- **Saved at link time:** the phone keeps the ticket summary, all active points
  of interest, and the sampling settings.

### Consent
- No location is read until the visitor taps **Allow location**.
- **No thanks** keeps the ticket status and the nearby list, without tracking.
- The visitor can stop sharing, or start, at any time. The server also refuses
  any point dated before consent was given.

### Location recording
- **Source:** the browser's Geolocation API, battery-friendly (no forced GPS,
  cached fixes up to 60 s accepted).
- **Sampling:** a point is recorded after 100 m or 2 minutes (configurable).
- **Storage:** each point is saved on the phone (`tour_points`) with an id
  generated there, then queued in the **existing outbox**.
- **Upload:** through the **existing sync engine** (same op-id log, same replay
  rules) at `/tour/sync`, using the visitor token. Repeated uploads store
  nothing twice.
- **Status shown to the visitor:** tracking on, paused (page hidden or paused by
  the visitor), off, blocked by the browser, or ended. The page says plainly
  that location is only recorded while it is open.

### Points of interest and nearby alerts
- **Admin screen** (management, `/points-of-interest`): name, type, description,
  coordinates, alert radius, opening hours, active flag, and an optional link to
  the activity catalogue.
- **Seed data:** two placeholders, clearly labelled, inactive, at 0,0. They are
  never sent to phones.
- **Nearby check:** runs on the phone against the saved list, with no network.
  It does not repeat within 60 minutes (configurable).
- **Alerts:** always shown in the page, plus a system notification if allowed.
  Each alert is queued and uploaded as a `poi_alert`.
- **List and map:** the list is sorted by distance and works offline. The
  OpenStreetMap map (Leaflet) appears when tiles load.

### Management view
- **Live tracking** (`/live-tracking`):
  - each open session's last known position and how long ago it was recorded
  - a notice that positions can be old when a phone was offline
  - filters by gate, category and time since last update
  - a visitor's path for the current visit
  - counts of visitors near each point of interest
- **"No recent location" alert:** raised for a consenting session with no update
  for 30 minutes (configurable) and fed into the existing alerts list.

### Ending tracking
A session closes when:
- an exit is recorded (exit endpoint, an exit synced from an offline station,
  booking check-out, or an exit scan), or
- the ticket expires.

The server accepts points recorded *before* the exit (they can upload late) and
refuses anything recorded after. The phone stops when it learns of the exit, or
at ticket expiry by its own clock, even offline.

### Access, privacy and retention
- **Visitor tokens:** signed for one ticket, valid until the ticket ends, with a
  separate audience. Staff endpoints reject them, and visitor endpoints reject
  staff logins. Every upload is checked against the token's own ticket.
- **New permission `view_visitor_locations`:** granted to management only,
  checked on the server for the live view, paths and busy-area counts. Viewing a
  path is audited.
- **Retention:** location points and alert records older than 30 days
  (configurable) are deleted, and an old last-known position on a session is
  cleared. This runs at start-up and every 24 hours while the server is up.
  Only counts are audited, never coordinates.
- **Test data:** tests use synthetic coordinates near 0,0 in the Atlantic. No
  real locations appear in code, fixtures or logs.

### Settings (environment variables)

| Setting | Default |
|---|---|
| `VMIS_TRACKING_MIN_DISTANCE_M` | 100 |
| `VMIS_TRACKING_MIN_INTERVAL_S` | 120 |
| `VMIS_POI_REPEAT_MINUTES` | 60 |
| `VMIS_LOCATION_RETENTION_DAYS` | 30 |
| `VMIS_TRACKING_STALE_MINUTES` | 30 |
| `VMIS_LOCATION_RETENTION_INTERVAL_HOURS` | 24 |

### Tests (section 6)
Server: `services/api/tests/test_tracking.py` (20 tests). Phone:
`services/web/tests/tour.test.js` (11 tests). All existing tests still pass:
262 server, 52 web.

| Section 6 test | Where |
|---|---|
| Check-in, one session per ticket | `test_scan_links_to_the_right_ticket_and_one_session_per_ticket` |
| Consent declined, zero points | `test_consent_declined_stores_zero_points` (server); "stores zero points when consent is declined" (phone) |
| Offline recording, zero lost | "keeps every point recorded offline…" (phone, including a failed first upload); `test_points_recorded_offline_all_arrive` |
| Same batch twice, zero duplicates | `test_uploading_the_same_batch_twice_creates_no_duplicates` |
| Nearby check, exact alert list | "alerts exactly for the radii the synthetic path passes through" |
| No repeats | "alerts once while staying inside a radius…" |
| Exit closes the session | `test_exit_closes_session_and_rejects_later_points`, `test_offline_station_exit_also_closes`, `test_ticket_expiry_ends_tracking` |
| Access denied | `test_visitor_token_cannot_touch_another_visitors_session`, `test_live_view_needs_the_location_permission` |
| Retention | `test_retention_deletes_old_points` |

## Not built
- **Background tracking with the page closed or the screen off.** Browsers do
  not allow it, so the page does not claim it (out of scope).
- **Offline map tiles.** Tiles come from OpenStreetMap and need a connection.
  Offline, the map hides itself and the list carries on.
- **Real points of interest.** Only placeholders are seeded. Real names,
  coordinates and hours are to be supplied.
- **A separate scheduler.** Retention runs at start-up and on a 24-hour timer
  inside the API process (see limits).

## Limits found
- **Location only while the page is open and on screen.** When the visitor locks
  the phone or switches apps, the browser stops giving positions. The page shows
  "Tracking paused", and the gap appears in the path.
- **First visit needs signal.** A phone that has never opened the app cannot
  load it with no signal at all. Once opened (for example at the gate, where
  there is usually some connection), it works offline after that.
- **Delayed upload.** A phone that was offline uploads its points later. The
  live view shows each position's own record time, so old positions look old
  (and are flagged after 30 minutes).
- **Cached first fix.** A browser may hand back a fix taken moments before
  consent. Such a point is dated at the consent time rather than refused.
  This was found in browser testing.
- **Hosting.** On a host that sleeps when idle (such as Render's free plan), the
  24-hour retention timer only runs while the server is awake. Retention also
  runs at every start-up, so deletion is late at worst, not skipped.
- **iPhone notifications.** iOS Safari only shows system notifications for an
  installed (home-screen) web app. The in-page alert always works.
- **Unverified offline link.** A ticket typed at an offline gate is not checked
  until the phone has signal. If the server then rejects it, the local session is
  discarded and the visitor is asked to link again.

## Decisions taken with the plan
1. A "ticket" is either a walk-in entry or a paid booking. The session closes on
   whichever exit applies.
2. The per-visitor QR carries a server-signed token. When the officer is offline,
   it carries the visitor id, and the phone swaps it for a token once online.
3. A typed short `VM-` code also needs the passport/ID number.
4. Visitor uploads reuse the outbox, op ids and sync engine, through their own
   `/tour/sync` entry point.
5. Points recorded before an exit are accepted even if they arrive late. Points
   recorded after it are refused.
6. Only management can see locations.
7. Retention runs at start-up and daily. Tests call the job directly.
8. Placeholder points of interest sit at 0,0, inactive.
