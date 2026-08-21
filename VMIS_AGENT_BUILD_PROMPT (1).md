# Agent Build Prompt: Visitor Management Information System (VMIS)

**For: Murchison Falls National Park, Uganda Wildlife Authority**
**Source of truth: `VMIS_Research_Proposal_UTAMU.docx` (Chapters 1–3)**

You are building the software artefact described in the attached research
proposal. This file is your spec. Read it fully before writing any code.
Where this file and the proposal ever disagree, the proposal wins — flag
the conflict instead of silently picking one.

---

## 1. What you are building, in one paragraph

A Visitor Management Information System that registers each visitor to
Murchison Falls National Park exactly once, issues them a unique ID and
QR code, tracks their activities, accommodation, and ticket validity
against that single record, and gives park management a live count of
who is inside the park. Its defining characteristic is that it keeps
working when the network doesn't: every gate and payment station writes
to a local store first and syncs to the central database when
connectivity returns. This is not an optional feature — it is the reason
the project exists, and it should shape the data model from the first
migration, not get bolted on at the end.

---

## 2. Non-negotiable constraints

These come directly from the proposal and must not be silently relaxed:

- **No survey/questionnaire artefacts anywhere in the codebase or docs.**
  Requirements trace to literature + observation only (see §4).
- **Offline-first is architectural, not a nice-to-have.** Registration,
  QR verification, and activity/fee capture must all function with zero
  network connectivity at the station, and must sync cleanly on
  reconnect. If you find yourself writing a feature that assumes the
  server is always reachable, stop and redesign it.
- **The server is authoritative for anything that must be correct in
  aggregate** — final ticket status and revenue totals, specifically.
  Routine record creation (a new registration, a new activity line) is
  accepted from the client as submitted. Don't blur this line.
- **No personal visitor data in logs, commits, or test fixtures beyond
  synthetic data.** Names, passport numbers, and national ID numbers are
  governed by the Data Protection and Privacy Act, 2019 (see §8).
- **Currency values are integer minor units**, currency recorded
  alongside. Never store money as a float.
- **Timestamps are stored in a single unambiguous form** (UTC,
  ISO 8601) so a station with a wrong local clock can't corrupt a
  stored expiry.

---

## 3. Tech stack (Table 5 of the proposal — do not substitute without asking)

| Layer | Choice |
|---|---|
| Frontend | HTML5, CSS, JavaScript, Bootstrap, React (PWA — must be installable, must run in-browser with no app-store dependency) |
| Local store | IndexedDB in browser clients; SQLite where a native client is used |
| Backend | FastAPI (Python) |
| Database | PostgreSQL |
| Cache | Redis (dashboard counters only — not a source of truth) |
| QR | Any QR generation/scan library readable by an ordinary camera |
| Maps | OpenStreetMap (no licensed map provider) |
| Deployment | Docker; on-premises or in-country cloud hosting preferred (see §8 on data residency) |
| CI | Git + GitHub Actions running pytest on every push to main |

---

## 4. Requirements you are implementing

These are Table 3 and Table 4 from the proposal, reproduced here so you
don't have to cross-reference constantly. Build against these directly.

### 4.1 Functional areas (Table 3)

| Area | Spec |
|---|---|
| Visitor registration | One record per visitor. Globally unique identifier generated **at the station** (must not collide across offline stations — do not use a server-issued sequential ID as the primary identifier). Duplicate check on ID number + name warns the officer. Category assignment: FNR, FR, ROA, EAC (see Table 1 for what these are and their fee implications). |
| Identification | QR code encodes the visitor identifier. Must be verifiable against the **local** record when the station is offline. |
| Entry and exit | Capture gate, timestamp, officer, ticket number on entry. Match an exit record on departure. Flag open (unmatched) stays. |
| Activities and fees | Activity catalogue with per-category rates (Table 1). Fee computed automatically when an activity is added. Multiple activities per visitor. Amounts in minor units. |
| Accommodation | Record facility + nights. Feeds occupancy/average-stay reporting. |
| Ticket validity | Expiry = entry timestamp + (nights purchased × 24h) — see Table 4 for the exact rule. Status/countdown computed on demand, never stored as a stale field. |
| Offline operation | Local store, optimistic writes, outbound delta log, idempotent replay on reconnect. Server recomputes final status/revenue centrally on merge. |
| Alerts | Ticket expiry, overstay, missing exit, duplicate entry. |
| Dashboard/reporting | Live counts by gate/lodge/activity/category. Daily/weekly/monthly/quarterly/annual reports, exportable. Show last-sync time per station. |
| Security/access | Auth + RBAC (see §6). Encryption in transit and at rest. Audit log of record changes. Defined retention period. |

### 4.2 Ticket validity rule (Table 4 — implement exactly)

```
expiry = entry_timestamp + (nights_purchased × 24 hours)
status = "Active" if now < expiry else "Expired"
```
Both `status` and remaining time are **derived on every request**, never
persisted as a field that could go stale.

### 4.3 Fee schedule (Table 1 — seed data, not hardcoded logic)

Four categories: **FNR** (Foreign Non-Resident, USD), **FR** (Foreign
Resident, USD), **ROA** (Rest of Africa, USD), **EAC** (East African
Citizen, UGX). Activities include park entrance, day/night game drive,
self-drive, launch trip, hiking/viewing at the falls, university and
secondary viewing, wildlife clubs (free), sport fishing, bird watching,
cycling. Load the actual current UWA tariff into a seed/fixture table —
do not invent figures. Confirm current rates with UWA before going
further than a development fixture.

---

## 5. Architecture (§3.2.3 of the proposal — Figure 1)

Layered, offline-first:

```
Client layer:     gate registration clients, activity/payment stations,
                   QR scanning devices, management dashboard
                   ↓ (writes local-first)
Local layer:       IndexedDB/SQLite + outbound sync queue
                   ↓ (syncs on reconnect)
Sync layer:        synchronisation service — delta upload, idempotent
                   replay, server-side merge rules
                   ↓
Application layer: FastAPI — hosts every functional module in §4.1,
                   enforces auth/RBAC
                   ↓
Data layer:        PostgreSQL (system of record) + Redis (cache only)
                   ↓
External:          notification gateway, OpenStreetMap
```

Build the sync layer **first**, before any feature module, per §3.3.2 of
the proposal: "The synchronisation layer is built early rather than
added at the end, because offline behaviour affects the design of every
module that writes data, and retrofitting it would require reworking
identifier generation and record creation throughout." Do not deviate
from this sequencing.

### Conflict handling rule (important, from §2.2.4 / research gap)

Data-structure conflicts (two offline edits to the same record) and
**business-rule violations** (e.g. two stations both correctly registering
what they each believe is a new visitor, producing a duplicate) are not
the same problem and need different handling:
- Structural conflicts: resolve via last-write-wins or explicit merge
  rule, your choice, documented.
- Business-rule violations that cannot be auto-resolved (e.g.
  contradictory exit records for the same visitor): write to an
  **exceptions list** for a human supervisor to settle. Never silently
  drop or silently pick a winner on these.

---

## 6. Roles and access (build RBAC around these from the start)

- Gate officer — registration, entry/exit at their gate only
- Activity station officer — activity/fee capture at their station
- Management — full dashboard, reporting, exceptions queue, audit log

---

## 7. Build order (Table 6 / Table 7 of the proposal — six sprints)

Follow this sequence; don't reorder without a documented reason:

1. **Sprint 1** — Data model, auth, RBAC
2. **Sprint 2** — Registration, unique identifier generation, QR issue/scan
3. **Sprint 3** — Entry/exit, ticket validity engine
4. **Sprint 4** — Activities, fees, accommodation tracking
5. **Sprint 5** — Local store, sync queue, server merge rules
6. **Sprint 6** — Dashboard, alerts, reporting, hardening

Note this differs from the naive reading of §3.2.3 above (which says
build sync "first") — reconcile as: get the local-store/queue
**scaffolding** in from Sprint 1 (every model writes local-first from
day one), but the full sync **service** with merge rules lands in
Sprint 5 once there's enough written data to make merge testing
meaningful. If you think this ordering is wrong, say so before starting
Sprint 2, not after.

---

## 8. Legal constraints (§3.5 of the proposal — treat as hard requirements)

- Data Protection and Privacy Act, 2019 governs all visitor personal
  data (name, passport/national ID, nationality, contact details).
- Collect only what's necessary. Show a privacy notice at registration.
- Restrict access by role (see §6).
- Encrypt data in transit and at rest, **including on-device in the
  local store** — this is not optional just because it's a phone/tablet.
- Define and implement a retention period; don't leave this
  unconfigured.
- Cross-border data transfer requires either equivalent protection or
  consent — default to in-country/on-prem hosting to sidestep this
  entirely unless told otherwise.
- Get written authorisation from Uganda Wildlife Authority before any
  observation, pilot, or production deployment involving real visitors.
  Use synthetic data for all development and demo work.

---

## 9. Testing — what "done" means (§3.4 and Table 8 of the proposal)

Do not consider a module complete until it passes its category below.

| Category | What to test | Target |
|---|---|---|
| Functional | Acceptance criteria checklist per module | ≥ 95% pass |
| Synchronisation | Deliberately disconnect clients, create/modify records, reconnect, compare resulting central state to expected state | **Zero** records lost |
| Synchronisation | Repeated/interrupted upload retried | **Zero** duplicate records created |
| Synchronisation | Two stations register concurrently offline | **Zero** identifier collisions |
| Synchronisation | Ticket status after merge vs. computed from entry time | 100% match |
| Performance | QR verification response time | < 1 second |
| Performance | Registration submission response time | < 2 seconds |
| Performance | Error rate under representative concurrent load | < 1% |
| Usability | Task-based test: register a visitor, verify a ticket | ≥ 90% task completion |
| Usability | Expert heuristic evaluation (Nielsen's 10 heuristics) | mean severity ≤ 2 (minor) |

Synchronisation testing is not optional or lower-priority than the
others — per the proposal, it's "the distinguishing characteristic of
the design." Write these tests before you consider a sync-touching
feature mergeable.

---

## 10. Explicitly out of scope (don't build these unless asked)

- Anything requiring a questionnaire, survey, or interview data pipeline
- Any feature not traceable to Table 3 of the proposal
- Card/mobile-money payment gateway integration (not in the proposal's
  scope as written — confirm before adding)
- Native mobile apps beyond the PWA (proposal specifies PWA + optional
  SQLite native client, not a bespoke iOS/Android app)

---

## 11. Deliverable checklist

By the end of this build, you should have:

- [ ] A FastAPI backend implementing every module in §4.1
- [ ] A PostgreSQL schema with migrations, seeded with the real UWA fee
      schedule (Table 1), not placeholder numbers
- [ ] A React/PWA frontend usable fully offline for registration, QR
      verification, and activity capture
- [ ] A working sync service satisfying the zero-loss / zero-duplicate /
      zero-collision tests in §9
- [ ] RBAC enforced server-side, not just hidden in the UI
- [ ] An audit log covering every record change
- [ ] A dashboard showing live visitor counts, revenue, and per-station
      last-sync time
- [ ] An exceptions queue for unresolved sync conflicts
- [ ] Automated test suite covering the categories in §9, running in CI
      on every push
- [ ] Docker-based deployment, documented, defaulting to in-country
      hosting
- [ ] A short README stating what was built against this spec, what
      deviated and why, and what remains open (e.g. the fee schedule
      needs sign-off from UWA before production use)

If you cannot meet an item above, don't mark it done — say so in the
README and explain the gap.
