# VMIS — Visitor Management Information System

Murchison Falls National Park, Uganda Wildlife Authority.

Offline-first visitor registration, identification, ticketing, and reporting.
Spec: [VMIS_AGENT_BUILD_PROMPT (1).md](VMIS_AGENT_BUILD_PROMPT%20(1).md). Working
rules: [agents.rules.md](agents.rules.md).

## Status

Sprints 1 and 2 of 6 are built and tested. Sprint 1: data model, auth, RBAC.
Sprint 2: visitor registration, station-generated identifiers, QR issue/scan.
Offline-first fields are baked into the schema from the first migration (per
build prompt section 7). Sprints 3 to 6 are not built yet — see
[Open items](#open-items).

## Layout

```
services/api/          FastAPI backend (system of record)
  app/                 application code
    models/            SQLAlchemy models + offline-first mixins
    routers/           auth, users
    security.py        Argon2 hashing + JWT
    rbac.py            server-side role enforcement
    qr.py              QR payload build/parse + PNG render
  migrations/          Alembic migrations
  tests/               gate tests (pytest, SQLite, free, fast)
docker-compose.yml     PostgreSQL + API, on-prem by default
.github/workflows/     CI: pytest on every push/PR to main
```

Services-first per agents.rules.md: each concern lives under its own directory
with its own tests. Future sprints add sibling services (sync, frontend PWA).

## Run the tests

```sh
cd services/api
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
python -m pytest
```

## Run the API locally (Docker, PostgreSQL)

```sh
cp .env.example .env      # then edit secrets
docker compose up --build
# API on http://localhost:8000 , docs at /docs
```

On first start, a single management account is seeded from
`VMIS_BOOTSTRAP_ADMIN_USERNAME` / `VMIS_BOOTSTRAP_ADMIN_PASSWORD` only if the
users table is empty. Rotate it immediately.

## What is built against the spec

- **Data model (Sprint 1).** `users`, `visitors`, `audit_entries`. Alembic
  initial migration included and verified to apply cleanly.
- **Offline-first identifiers (sections 2, 4.1, 7).** Every domain record uses a
  station-generated UUID primary key (`uuid4`), never a server sequential id, so
  concurrent offline registrations at different gates cannot collide. Records
  carry `origin_station_id`, `client_created_at`, and `server_received_at`
  (NULL until merged centrally). This is the sync scaffolding required "from day
  one".
- **Time and money discipline (section 2).** Timestamps are timezone-aware UTC.
  No monetary values are stored yet; when Sprint 4 lands they will be integer
  minor units with an explicit currency, never floats.
- **Auth + RBAC (sections 6, 11).** Argon2id password hashing, HS256 JWT access
  tokens, three roles (`gate_officer`, `activity_officer`, `management`), and a
  per-user `station_id` for gate/station scoping. RBAC is enforced server-side
  in FastAPI dependencies, not hidden in the UI. User administration is
  management-only.
- **Audit log (sections 4.1, 11).** Append-only `audit_entries`; a helper writes
  create/login events. No plaintext PII is placed in audit details.
- **Registration + identification (Sprint 2, section 4.1).** `POST /visitors`
  registers one record per visitor with category (FNR/FR/ROA/EAC). Clients may
  supply a station-generated UUID; re-posting the same id is idempotent (no
  duplicate on offline replay). A duplicate check on id_number + name warns the
  officer without blocking. `GET /visitors/{id}/qr` returns a PNG QR that encodes
  only the identifier; `POST /visitors/verify` resolves a scanned payload to a
  record (the online counterpart of an offline local-store check). Registration
  is gate-officer/management only; verification is open to all officer roles.
- **Privacy by design (section 8).** Visitor PII is minimised (name, ID number,
  nationality) with a `privacy_notice_accepted` flag enforced at registration; a
  retention-period setting (`VMIS_PII_RETENTION_DAYS`) is configured though
  enforcement lands later. All test/dev data is synthetic.
- **CI (section 3).** GitHub Actions runs pytest on every push and PR to main.
- **Deployment (section 8).** Docker Compose, PostgreSQL, on-prem by default; no
  external managed services or licensed providers.

## Deviations from the spec

- **Default database is SQLite for zero-config local runs and gate tests.**
  PostgreSQL remains the production system of record (`VMIS_DATABASE_URL` +
  Docker Compose). Models use portable types (`sqlalchemy.Uuid`) so both work.
  Rationale: agents.rules.md gate tests must be free and run in under two
  seconds; a Postgres dependency in the test lane would break that.
- **Nothing else deviates.** Where the build prompt and proposal could conflict,
  none has arisen at this stage.

## Open items

Not yet built (marked honestly, not as done):

- [x] **Sprint 2** — registration API, QR issue/scan, duplicate warning on
      id_number + name. Built and tested.
- [ ] **Sprint 3** — entry/exit capture, ticket validity engine
      (`expiry = entry + nights x 24h`, status derived on demand, never stored).
- [ ] **Sprint 4** — activities, fees (integer minor units), accommodation.
      Requires the real UWA tariff (Table 1) — must be signed off by UWA before
      production; only a development fixture will be used until then.
- [ ] **Sprint 5** — local store (IndexedDB/SQLite), outbound sync queue,
      server merge rules, exceptions list for business-rule conflicts.
- [ ] **Sprint 6** — dashboard, alerts, reporting, hardening (encryption at
      rest including on-device, retention enforcement).
- [ ] **Frontend** — React PWA (installable, fully offline for registration, QR
      verification, activity capture).
- [ ] **Sync test suite** — zero-loss / zero-duplicate / zero-collision
      (section 9). This is the distinguishing characteristic and gates every
      sync-touching feature.

## Legal

Visitor personal data is governed by the Data Protection and Privacy Act, 2019.
Written authorisation from Uganda Wildlife Authority is required before any
observation, pilot, or production deployment involving real visitors. All
development and demo work uses synthetic data only.
