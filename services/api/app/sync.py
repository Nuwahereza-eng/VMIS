"""Synchronisation engine (build prompt sections 3.2.3, 4.1, 9).

A station uploads a batch of deltas it captured offline. The engine replays them
into the system of record with three guarantees that the section 9 tests pin
down:

* **Zero duplicates** \u2014 each operation carries a client-generated ``op_id`` that
  is logged; a repeated or interrupted upload re-sending the same op is skipped.
  Record creates are additionally idempotent on their station-generated id.
* **Zero identifier collisions** \u2014 ids are station-generated UUIDs, so two
  stations creating records offline never collide when both sync.
* **Zero records lost** \u2014 every operation results in a stored record or a logged
  exception; nothing is silently dropped.

Merge rules:

* Structural re-creates (same id) are idempotent no-ops.
* A visit exit that contradicts an already-recorded exit is a business-rule
  violation: the original is kept and the conflict is written to the exceptions
  list (never silently overwritten).
* A synced visitor that shares id_number + name with an existing different
  record is flagged as a possible duplicate for a supervisor, but the record is
  still stored (never dropped).

Revenue is recomputed server-side on merge (the server is authoritative for
totals): activity fees are recomputed from the current tariff, not trusted from
the client.
"""

import json
import uuid

from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.fees import RateNotFound, quote_activity_fee
from app.models.activity import Activity
from app.models.base import ensure_utc, utcnow
from app.models.booking import Accommodation, VisitorActivity
from app.models.enums import VisitorCategory
from app.models.sync import SyncException, SyncOperation
from app.models.user import User
from app.models.visit import Visit
from app.models.visitor import Visitor
from app.schemas import SyncBatchRequest, SyncBatchResult, SyncOp, SyncOpResult

from datetime import datetime


# --- payload validation models (strict shapes for each entity type) ---


class _VisitorPayload(BaseModel):
    id: uuid.UUID
    full_name: str
    id_number: str
    category: VisitorCategory
    privacy_notice_accepted: bool
    nationality: str | None = None
    origin_station_id: str | None = None
    client_created_at: datetime | None = None


class _VisitPayload(BaseModel):
    id: uuid.UUID
    visitor_id: uuid.UUID
    entry_gate: str
    entry_timestamp: datetime
    ticket_number: str
    nights_purchased: int
    origin_station_id: str | None = None
    client_created_at: datetime | None = None


class _VisitExitPayload(BaseModel):
    exit_gate: str
    exit_timestamp: datetime


class _VisitorActivityPayload(BaseModel):
    id: uuid.UUID
    visitor_id: uuid.UUID
    activity_id: uuid.UUID
    quantity: int = 1
    origin_station_id: str | None = None
    client_created_at: datetime | None = None


class _AccommodationPayload(BaseModel):
    id: uuid.UUID
    visitor_id: uuid.UUID
    facility: str
    nights: int
    origin_station_id: str | None = None
    client_created_at: datetime | None = None


# Apply dependency order so that, within a batch, parents land before children
# regardless of the order the client sent them in.
_ENTITY_RANK = {
    "visitor": 0,
    "visit": 1,
    "visitor_activity": 2,
    "accommodation": 2,
    "visit_exit": 3,
}


class _OpOutcome:
    def __init__(self, result: str, entity_id: uuid.UUID | None, exception_kind: str | None = None):
        self.result = result
        self.entity_id = entity_id
        self.exception_kind = exception_kind


def _raise_exception(
    db: Session,
    *,
    station_id: str | None,
    entity_type: str,
    entity_id: uuid.UUID | None,
    kind: str,
    detail: dict,
) -> None:
    db.add(
        SyncException(
            station_id=station_id,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            kind=kind,
            detail=json.dumps(detail, separators=(",", ":"), default=str),
        )
    )


def _apply_visitor(db: Session, op: SyncOp, station_id: str | None, actor: User) -> _OpOutcome:
    data = _VisitorPayload.model_validate(op.payload)
    existing = db.get(Visitor, data.id)
    if existing is not None:
        return _OpOutcome("exists", data.id)

    visitor = Visitor(
        id=data.id,
        full_name=data.full_name,
        id_number=data.id_number,
        nationality=data.nationality,
        category=data.category,
        privacy_notice_accepted=data.privacy_notice_accepted,
        origin_station_id=data.origin_station_id or station_id,
        client_created_at=data.client_created_at,
        server_received_at=utcnow(),
    )
    db.add(visitor)
    db.flush()

    # Possible business-rule duplicate: same person, different station id.
    dup = db.scalar(
        select(Visitor.id).where(
            Visitor.id_number == data.id_number,
            Visitor.full_name == data.full_name,
            Visitor.id != data.id,
        )
    )
    exception_kind = None
    if dup is not None:
        exception_kind = "possible_duplicate_visitor"
        _raise_exception(
            db,
            station_id=station_id,
            entity_type="visitor",
            entity_id=data.id,
            kind=exception_kind,
            detail={"id_number": data.id_number, "other_visitor_id": str(dup)},
        )

    record_audit(db, action="sync_create", entity_type="visitor", entity_id=str(visitor.id), actor_user_id=actor.id)
    return _OpOutcome("applied", data.id, exception_kind)


def _apply_visit(db: Session, op: SyncOp, station_id: str | None, actor: User) -> _OpOutcome:
    data = _VisitPayload.model_validate(op.payload)
    existing = db.get(Visit, data.id)
    if existing is not None:
        return _OpOutcome("exists", data.id)

    if db.get(Visitor, data.visitor_id) is None:
        _raise_exception(
            db,
            station_id=station_id,
            entity_type="visit",
            entity_id=data.id,
            kind="missing_visitor",
            detail=op.payload,
        )
        return _OpOutcome("conflict", data.id, "missing_visitor")

    visit = Visit(
        id=data.id,
        visitor_id=data.visitor_id,
        entry_gate=data.entry_gate,
        entry_timestamp=data.entry_timestamp,
        ticket_number=data.ticket_number,
        nights_purchased=data.nights_purchased,
        origin_station_id=data.origin_station_id or station_id,
        client_created_at=data.client_created_at,
        server_received_at=utcnow(),
    )
    db.add(visit)
    db.flush()
    record_audit(db, action="sync_create", entity_type="visit", entity_id=str(visit.id), actor_user_id=actor.id)
    return _OpOutcome("applied", data.id)


def _apply_visit_exit(db: Session, op: SyncOp, station_id: str | None, actor: User) -> _OpOutcome:
    if op.entity_id is None:
        _raise_exception(
            db, station_id=station_id, entity_type="visit_exit", entity_id=None,
            kind="missing_entity_id", detail=op.payload,
        )
        return _OpOutcome("conflict", None, "missing_entity_id")

    data = _VisitExitPayload.model_validate(op.payload)
    visit = db.get(Visit, op.entity_id)
    if visit is None:
        _raise_exception(
            db, station_id=station_id, entity_type="visit_exit", entity_id=op.entity_id,
            kind="missing_visit", detail=op.payload,
        )
        return _OpOutcome("conflict", op.entity_id, "missing_visit")

    if visit.exit_timestamp is not None:
        # Idempotent if the same exit; otherwise a contradictory exit conflict.
        same = (
            ensure_utc(visit.exit_timestamp) == ensure_utc(data.exit_timestamp)
            and (visit.exit_gate or None) == (data.exit_gate or None)
        )
        if same:
            return _OpOutcome("exists", op.entity_id)
        _raise_exception(
            db, station_id=station_id, entity_type="visit_exit", entity_id=op.entity_id,
            kind="contradictory_exit",
            detail={
                "existing_exit": str(visit.exit_timestamp),
                "existing_gate": visit.exit_gate,
                "incoming_exit": str(data.exit_timestamp),
                "incoming_gate": data.exit_gate,
            },
        )
        return _OpOutcome("conflict", op.entity_id, "contradictory_exit")

    visit.exit_gate = data.exit_gate
    visit.exit_timestamp = data.exit_timestamp
    db.flush()
    record_audit(db, action="sync_update", entity_type="visit", entity_id=str(visit.id), actor_user_id=actor.id)
    return _OpOutcome("applied", op.entity_id)


def _apply_visitor_activity(db: Session, op: SyncOp, station_id: str | None, actor: User) -> _OpOutcome:
    data = _VisitorActivityPayload.model_validate(op.payload)
    existing = db.get(VisitorActivity, data.id)
    if existing is not None:
        return _OpOutcome("exists", data.id)

    visitor = db.get(Visitor, data.visitor_id)
    activity = db.get(Activity, data.activity_id)
    if visitor is None or activity is None:
        _raise_exception(
            db, station_id=station_id, entity_type="visitor_activity", entity_id=data.id,
            kind="missing_reference", detail=op.payload,
        )
        return _OpOutcome("conflict", data.id, "missing_reference")

    # Server is authoritative for revenue: recompute the fee, do not trust the
    # client's amount.
    try:
        quote = quote_activity_fee(db, activity, visitor.category, data.quantity)
    except (RateNotFound, ValueError):
        _raise_exception(
            db, station_id=station_id, entity_type="visitor_activity", entity_id=data.id,
            kind="no_rate", detail=op.payload,
        )
        return _OpOutcome("conflict", data.id, "no_rate")

    line = VisitorActivity(
        id=data.id,
        visitor_id=visitor.id,
        activity_id=activity.id,
        category=visitor.category,
        quantity=data.quantity,
        unit_amount_minor=quote.unit_amount_minor,
        amount_minor=quote.amount_minor,
        currency=quote.currency,
        origin_station_id=data.origin_station_id or station_id,
        client_created_at=data.client_created_at,
        server_received_at=utcnow(),
    )
    db.add(line)
    db.flush()
    record_audit(db, action="sync_create", entity_type="visitor_activity", entity_id=str(line.id), actor_user_id=actor.id)
    return _OpOutcome("applied", data.id)


def _apply_accommodation(db: Session, op: SyncOp, station_id: str | None, actor: User) -> _OpOutcome:
    data = _AccommodationPayload.model_validate(op.payload)
    existing = db.get(Accommodation, data.id)
    if existing is not None:
        return _OpOutcome("exists", data.id)

    if db.get(Visitor, data.visitor_id) is None:
        _raise_exception(
            db, station_id=station_id, entity_type="accommodation", entity_id=data.id,
            kind="missing_visitor", detail=op.payload,
        )
        return _OpOutcome("conflict", data.id, "missing_visitor")

    record = Accommodation(
        id=data.id,
        visitor_id=data.visitor_id,
        facility=data.facility,
        nights=data.nights,
        origin_station_id=data.origin_station_id or station_id,
        client_created_at=data.client_created_at,
        server_received_at=utcnow(),
    )
    db.add(record)
    db.flush()
    record_audit(db, action="sync_create", entity_type="accommodation", entity_id=str(record.id), actor_user_id=actor.id)
    return _OpOutcome("applied", data.id)


_HANDLERS = {
    "visitor": _apply_visitor,
    "visit": _apply_visit,
    "visit_exit": _apply_visit_exit,
    "visitor_activity": _apply_visitor_activity,
    "accommodation": _apply_accommodation,
}


def apply_batch(db: Session, request: SyncBatchRequest, actor: User) -> SyncBatchResult:
    results: list[SyncOpResult] = []

    # Stable sort by dependency rank so parents apply before children in-batch.
    ordered = sorted(request.operations, key=lambda o: _ENTITY_RANK.get(o.entity_type, 99))

    for op in ordered:
        # Idempotent replay: an op_id already processed is skipped entirely.
        if db.get(SyncOperation, op.op_id) is not None:
            results.append(
                SyncOpResult(op_id=op.op_id, entity_type=op.entity_type, entity_id=op.entity_id, result="duplicate")
            )
            continue

        handler = _HANDLERS[op.entity_type]
        try:
            outcome = handler(db, op, request.station_id, actor)
        except ValidationError:
            _raise_exception(
                db, station_id=request.station_id, entity_type=op.entity_type, entity_id=op.entity_id,
                kind="invalid_payload", detail=op.payload,
            )
            outcome = _OpOutcome("conflict", op.entity_id, "invalid_payload")

        db.add(
            SyncOperation(
                op_id=op.op_id,
                station_id=request.station_id,
                entity_type=op.entity_type,
                entity_id=str(outcome.entity_id) if outcome.entity_id else None,
                result=outcome.result,
            )
        )
        db.flush()
        results.append(
            SyncOpResult(
                op_id=op.op_id,
                entity_type=op.entity_type,
                entity_id=outcome.entity_id,
                result=outcome.result,
                exception_kind=outcome.exception_kind,
            )
        )

    db.commit()

    return SyncBatchResult(
        processed=len(results),
        applied=sum(1 for r in results if r.result == "applied"),
        duplicates=sum(1 for r in results if r.result == "duplicate"),
        conflicts=sum(1 for r in results if r.result == "conflict"),
        results=results,
    )
