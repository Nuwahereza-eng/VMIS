"""Synchronisation endpoints (build prompt sections 3.2.3, 4.1, 5).

``POST /sync/batch`` accepts a station's offline delta log and replays it
idempotently into the system of record. ``GET /sync/exceptions`` is the
supervisor's queue of unresolved business-rule conflicts; management only.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.enums import Role
from app.models.sync import SyncException
from app.models.user import User
from app.rbac import require_roles
from app.schemas import SyncBatchRequest, SyncBatchResult, SyncExceptionOut
from app.sync import apply_batch

router = APIRouter(prefix="/sync", tags=["sync"])

# Any station officer may upload their own deltas; management may too.
_sync_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)


@router.post("/batch", response_model=SyncBatchResult)
def sync_batch(
    request: SyncBatchRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(_sync_roles),
) -> SyncBatchResult:
    return apply_batch(db, request, actor)


@router.get("/exceptions", response_model=list[SyncExceptionOut])
def list_exceptions(
    resolved: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.MANAGEMENT)),
) -> list[SyncException]:
    return list(
        db.scalars(
            select(SyncException)
            .where(SyncException.resolved == resolved)
            .order_by(SyncException.created_at)
        )
    )
