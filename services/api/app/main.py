"""FastAPI application factory for the VMIS backend (Sprint 1)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.bootstrap import bootstrap_admin
from app.config import get_settings
from app.db import SessionLocal, engine
from app.models import Base
from app.retention import enforce_retention
from app.routers import (
    activities,
    auth,
    charges,
    management,
    sync,
    users,
    visitors,
    visits,
)
from app.seed import seed_tariff


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev/first-run convenience. Production schema changes go through Alembic
    # migrations (see services/api/migrations); create_all only fills gaps.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        bootstrap_admin(db)
        # Load the development tariff fixture. Idempotent. The real UWA tariff
        # must replace this before production (build prompt section 4.3).
        seed_tariff(db)
        # Enforce the PII retention period at start (build prompt section 8).
        if get_settings().retention_enforce_on_start:
            enforce_retention(db)
            db.commit()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="VMIS API",
        version="0.1.0",
        description="Visitor Management Information System - Murchison Falls National Park",
        lifespan=lifespan,
    )
    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(visitors.router)
    app.include_router(visits.router)
    app.include_router(activities.router)
    app.include_router(charges.router)
    app.include_router(sync.router)
    app.include_router(management.router)

    @app.get("/health", tags=["ops"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
