"""FastAPI application factory for the VMIS backend (Sprint 1)."""

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.bootstrap import bootstrap_admin, seed_demo_users, seed_demo_visitors
from app.config import get_settings
from app.db import SessionLocal, engine
from app.models import Base
from app.retention import enforce_location_retention, enforce_retention
from app.routers import (
    activities,
    auth,
    bookings,
    charges,
    config,
    management,
    scans,
    sync,
    tour,
    tracking,
    users,
    visitors,
    visits,
)
from app.seed import seed_facilities, seed_gates, seed_points_of_interest, seed_tariff


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev/first-run convenience. Production schema changes go through Alembic
    # migrations (see services/api/migrations); create_all only fills gaps.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # On a public demo deploy (VMIS_SEED_DEMO_USERS=true) seed the fixed
        # accounts the login buttons use first; bootstrap_admin then sees a
        # populated users table and stands down. On a normal deploy this is a
        # no-op and bootstrap_admin creates the single management account.
        seed_demo_users(db)
        bootstrap_admin(db)
        # Load the development tariff fixture. Idempotent. The real UWA tariff
        # must replace this before production (build prompt section 4.3).
        seed_tariff(db)
        # Seed the editable gate and facility master lists (only when empty, so
        # management edits are never overwritten on restart).
        seed_gates(db)
        seed_facilities(db)
        # Placeholder points of interest only (inactive, at 0,0): real entries
        # are supplied by management in the points of interest screen.
        seed_points_of_interest(db)
        # On a public demo deploy, populate sample visitors/visits so the
        # dashboard isn't empty. No-op once the visitors table has any rows.
        seed_demo_visitors(db)
        # Enforce the PII retention period at start (build prompt section 8).
        if get_settings().retention_enforce_on_start:
            enforce_retention(db)
            enforce_location_retention(db)
            db.commit()
    # Location retention also runs daily while the server is up.
    retention_task = asyncio.create_task(_location_retention_loop())
    try:
        yield
    finally:
        retention_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await retention_task


def _run_location_retention() -> None:
    with SessionLocal() as db:
        enforce_location_retention(db)
        db.commit()


async def _location_retention_loop() -> None:
    interval = max(1, get_settings().location_retention_interval_hours) * 3600
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(_run_location_retention)
        except Exception:  # never let a failed run stop the schedule
            logging.getLogger("vmis.retention").exception("Location retention run failed")


def create_app() -> FastAPI:
    app = FastAPI(
        title="VMIS API",
        version="0.1.0",
        description="Visitor Management Information System - Murchison Falls National Park",
        lifespan=lifespan,
    )

    # Allow the browser PWA to call the API from another origin (e.g. Vercel).
    # Origins are configurable via VMIS_CORS_ALLOW_ORIGINS.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(visitors.router)
    app.include_router(visits.router)
    app.include_router(scans.router)
    app.include_router(bookings.router)
    app.include_router(activities.router)
    app.include_router(charges.router)
    app.include_router(config.router)
    app.include_router(sync.router)
    app.include_router(management.router)
    app.include_router(tour.router)
    app.include_router(tracking.router)

    @app.get("/health", tags=["ops"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
