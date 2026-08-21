# VMIS Web - offline-first PWA

The field client for the Visitor Management Information System: an installable
Progressive Web App for gate and activity officers. It works fully offline for
registration, QR verification, entry/exit, and activity capture, then syncs to
the FastAPI backend when a connection is available.

Tech: React + Bootstrap + Vite, IndexedDB via `idb`, `vite-plugin-pwa`
(Workbox) for the installable offline shell, `html5-qrcode` for camera
scanning (build prompt Table 5).

## Why offline-first

Gates and activity stations in the park have intermittent connectivity. Every
write lands in the browser's IndexedDB store first and is given a
station-generated UUID, so two clients registering at once can never collide
(build prompt sections 4.1, 9). An outbound queue holds each write as a sync
operation with its own `op_id`; on reconnect the queue is flushed to
`POST /sync/batch`, which replays the operations idempotently. A retried or
interrupted flush creates zero duplicates because the server dedupes on
`op_id`. Nothing is removed from the queue until the server acknowledges it.

The server stays authoritative for revenue: the app records which activity was
captured but never a fee, because the backend recomputes charges on merge.

## Layout

```
src/
  db/store.js          IndexedDB schema + helpers (local source of truth)
  data/repository.js   write-local-then-enqueue for every feature
  sync/queue.js        outbound queue, dependency ordering, flush to /sync/batch
  api/client.js        online-only calls (login, sync, catalogue, dashboard)
  auth/session.js      JWT session persistence (presentation only)
  domain/              ticket + category mirrors of the server rules
  context/AppContext.jsx  session, connectivity, outbox, auto-sync
  pages/               login, register, verify, visits, activities, sync
  components/          navbar, QR scanner
tests/                 Vitest suite for the deterministic core
```

## Develop

```sh
cd services/web
npm install
npm run dev        # http://localhost:5173, proxies /api paths to :8000
```

Run the backend separately (`docker compose up` at the repo root, or the API's
own instructions) so login and sync have a server to talk to.

## Test

```sh
npm test           # Vitest, deterministic, no network, no browser
```

The suite covers the offline-critical logic: the ticket-validity mirror,
station id generation, the local repository (write-local + enqueue), the sync
queue (dependency order, retry-is-safe / zero-duplicate, conflict clearing),
and session handling.

## Build + deploy

```sh
npm run build      # emits dist/ with the service worker + manifest
```

`docker compose up --build web` builds the bundle and serves it with nginx,
proxying API paths to the backend container so the browser sees a single
origin (no CORS). The service worker and app shell are served `no-cache` so
updates roll out on reload.

## Security note

RBAC is enforced server-side on every request and every sync; the role stored
in the session here only decides what the UI shows. On-device at-rest
encryption of the IndexedDB store is a remaining hardening task (see the root
README's "Known gap: encryption at rest"). Use synthetic data only until UWA
authorises real use (build prompt section 8).
