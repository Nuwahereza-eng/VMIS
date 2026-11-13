# Agent Build Prompt: Visitor Tour Tracking and Nearby Alerts (VMIS)

**For: the existing VMIS codebase, Murchison Falls National Park**
**Adds to: `VMIS_AGENT_BUILD_PROMPT.md`. Every constraint in that file still applies.**

You are adding one feature set to a system that already works. Read the
existing code before you write anything, and follow the stack, folder
layout, naming and test style you find there. Do not rewrite or restyle
existing modules. If something in this file conflicts with how the
codebase already works, stop and report the conflict instead of picking
one silently.

---

## 1. What you are building, in one paragraph

When a visitor reaches a gate, they scan a QR code with their own phone.
This opens a visitor page tied to their ticket and starts their visit.
With the visitor's consent, the phone then records its location during
the tour. The phone tells the visitor about facilities and activities
near them. Park management sees each visitor's last known location on
the dashboard. All of this must keep working where there is no network,
and tracking stops when the visitor exits the park.

---

## 2. Before you start

1. Map the existing code: how visitors, tickets, entry and exit records,
   the QR code, the local store and the sync queue are implemented.
2. Write a short plan listing the files you will add or change, the new
   tables and the new endpoints. Wait for approval of the plan before
   coding.
3. Reuse the existing sync queue, event identifiers and idempotent apply.
   Do not build a second sync mechanism.

---

## 3. Non-negotiable constraints

- **Offline first.** After the gate scan, the visitor page, location
  recording and nearby alerts must work with no connection. Nothing in
  the tour flow may wait on the server.
- **Consent before tracking.** No location is read or stored until the
  visitor accepts a clear consent screen. Declining must still let them
  use the visitor page (ticket status, facility list) without tracking.
- **Tracking ends at exit.** When an exit record is matched, or the
  ticket expires, recording stops and the visitor session closes.
- **The visitor never logs in with a staff account.** The visitor page
  is opened by a signed, expiring token tied to one ticket. It can read
  and write only that visitor's own session data.
- **Location is personal data.** No real locations in logs, commits or
  fixtures. Use synthetic data in tests. Apply a configurable retention
  period (default 30 days) after which location points are deleted.
- **Only staff roles with permission can see visitor locations.** Add a
  permission for this and check it on the server.
- **No licensed map provider.** Use OpenStreetMap, as in the main spec.
- **Timestamps in UTC, ISO 8601**, as in the main spec.

---

## 4. Requirements

### 4.1 Gate QR check-in

| Item | Spec |
|---|---|
| Gate QR | Each gate has a printable QR code. It opens the visitor page for that gate. The officer screen can also show a per-visitor QR after registration or entry, which opens the page already linked to that visitor's ticket. |
| Linking | If the visitor scans the gate QR, they link to their ticket by scanning or typing their ticket or visitor identifier. If they scan the per-visitor QR, linking is automatic. |
| Session | Linking creates a visit session: visitor, ticket, gate, start time, consent status. One open session per ticket. |
| Offline at the gate | The gate usually has some connection, but if it does not, the page must still open from the installed PWA or cached shell, create the session locally and sync it later. |
| Download at the gate | On linking, the phone saves what it needs for the tour: the visitor's ticket summary and the full list of points of interest. |

### 4.2 Location recording

| Item | Spec |
|---|---|
| Source | Browser Geolocation API on the visitor's phone. |
| Sampling | Record a point when the visitor has moved more than a set distance or a set time has passed. Both values are configurable (defaults: 100 m, 2 minutes). Keep battery use low. |
| Storage | Each point is saved locally first with a unique identifier, latitude, longitude, accuracy and UTC time, then placed on the sync queue. |
| Upload | Points upload in batches when a connection is available. A repeated upload must not create duplicates. |
| Limits | Be honest in the UI: a web page records location while it is open or installed and active. Show the visitor a simple "tracking on / paused" state. Do not claim background tracking the browser cannot do. |

### 4.3 Points of interest and nearby alerts

| Item | Spec |
|---|---|
| Catalogue | New admin screen to manage points of interest: name, type (facility or activity), description, latitude, longitude, alert radius, opening hours, active flag. Link activities to the existing activity catalogue where one exists. |
| Seed data | Seed with clearly marked placeholder entries only. Do not invent real coordinates, names or opening hours. Real entries will be supplied. |
| Nearby check | Runs on the phone against the saved list, with no network. When the visitor enters a point's radius, show an alert with its name, type, distance and description. |
| No repeats | Do not alert for the same point again within a configurable period (default 60 minutes). |
| Delivery | In-page alert always. Use a system notification as well if the visitor granted permission. |
| List and map | The visitor page shows a list of points sorted by distance, and a map if map tiles are available. The list must work without the map. |

### 4.4 Management view

| Item | Spec |
|---|---|
| Live view | Dashboard page showing each open session's last known location and when it was last updated. Make it clear that a location can be old because the phone was offline. |
| Filters | By gate, visitor category and time since last update. |
| Detail | Selecting a visitor shows their recorded path for the current visit. |
| Summary | Counts of visitors near each point of interest, for seeing which areas are busy. |
| Alerts | Flag an open session with no location update for longer than a configurable period. Feed this into the existing alerts. |

---

## 5. Data model additions

Add migrations for these. Adjust names to match existing conventions.

- `visit_session`: id, visitor id, ticket id, gate id, started at, ended at, consent given, consent time, end reason.
- `location_point`: id (client generated), session id, latitude, longitude, accuracy, recorded at, received at.
- `point_of_interest`: id, name, type, description, latitude, longitude, radius in metres, opening hours, active, updated at.
- `poi_alert`: id (client generated), session id, point of interest id, shown at.

---

## 6. Tests you must add

| Area | Test | Pass condition |
|---|---|---|
| Check-in | Scan links to the correct ticket; second scan for the same ticket | One open session per ticket |
| Consent | Consent declined | Zero location points stored |
| Offline recording | Record points with the network off, then reconnect | Zero points lost |
| Sync | Upload the same batch twice | Zero duplicate points |
| Nearby check | Synthetic path passing inside and outside several radii | Alerts match the expected list exactly |
| No repeats | Stay inside one radius | One alert within the repeat period |
| Exit | Exit record matched | Session closed, no points accepted afterwards |
| Access | Visitor token used for another visitor's data; staff role without permission opens the live view | Both denied |
| Retention | Points older than the retention period | Deleted by the scheduled job |

Existing tests must still pass. Do not weaken or delete them.

---

## 7. Out of scope

- Native mobile apps or background tracking outside what the browser allows.
- Hardware trackers, beacons or wristbands.
- Routing, turn by turn directions or guide assignment.
- Any change to fees, ticket rules or the existing sync merge rules.

---

## 8. Definition of done

- [ ] Plan approved before coding started
- [ ] Gate QR and per-visitor QR open the visitor page and create a session
- [ ] Consent screen in place; declining disables tracking only
- [ ] Location points recorded offline and synced without loss or duplicates
- [ ] Nearby alerts work with the network off
- [ ] Admin screen for points of interest, with placeholder seed data only
- [ ] Management live view with last known location and age of the update
- [ ] Tracking stops at exit or ticket expiry
- [ ] Retention job and permission checks in place
- [ ] All tests in section 6 written and passing, existing tests still passing
- [ ] Short notes file listing what was built, what was not, and any limits found (for example browser limits on background location)
