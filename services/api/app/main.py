"""FastAPI application factory for the VMIS backend (Sprint 1)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.bootstrap import bootstrap_admin
from app.db import SessionLocal, engine
from app.models import Base
from app.routers import auth, users, visitors


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev/first-run convenience. Production schema changes go through Alembic
    # migrations (see services/api/migrations); create_all only fills gaps.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        bootstrap_admin(db)
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

    @app.get("/health", tags=["ops"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
