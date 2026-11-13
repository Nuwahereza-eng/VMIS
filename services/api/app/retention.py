"""PII retention enforcement (build prompt section 8).

The Data Protection and Privacy Act, 2019 requires a defined, enforced
retention period. Once a visitor record is older than ``pii_retention_days``
its identifying fields are redacted in place: the aggregate record survives for
reporting, but the name, ID number, and nationality are removed. Redaction is
idempotent (the ``pii_redacted`` flag stops a record being processed twice) and
every redaction is written to the audit log.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.config import get_settings
from app.models.base import ensure_utc, utcnow
from app.models.tracking import LocationPoint, PoiAlert, VisitSession
from app.models.visitor import Visitor

REDACTED = "[redacted]"


@dataclass
class RetentionResult:
    cutoff: datetime
    redacted: int


def enforce_retention(
    db: Session,
    now: datetime | None = None,
    actor_user_id=None,
) -> RetentionResult:
    """Redact PII on every visitor older than the retention window.

    Returns the cutoff used and how many records were redacted this run.
    """
    settings = get_settings()
    reference = ensure_utc(now) if now is not None else utcnow()
    cutoff = reference - timedelta(days=settings.pii_retention_days)

    stale = db.scalars(
        select(Visitor).where(Visitor.pii_redacted.is_(False))
    ).all()

    redacted = 0
    for visitor in stale:
        created = ensure_utc(visitor.created_at)
        if created is None or created >= cutoff:
            continue
        visitor.full_name = REDACTED
        visitor.id_number = REDACTED
        visitor.nationality = None
        visitor.country = None
        visitor.age_category = None
        visitor.gender = None
        visitor.phone = None
        visitor.email = None
        visitor.tour_company = None
        visitor.vehicle_registration = None
        visitor.guide_name = None
        visitor.pii_redacted = True
        redacted += 1
        record_audit(
            db,
            action="redact",
            entity_type="visitor",
            entity_id=str(visitor.id),
            actor_user_id=actor_user_id,
            details={"reason": "retention", "retention_days": settings.pii_retention_days},
        )

    if redacted:
        db.flush()
    return RetentionResult(cutoff=cutoff, redacted=redacted)


# --- Location retention (tour tracking) ---


@dataclass
class LocationRetentionResult:
    cutoff: datetime
    points_deleted: int
    alerts_deleted: int


def enforce_location_retention(db: Session, now: datetime | None = None) -> LocationRetentionResult:
    """Delete location points (and nearby-alert records) older than
    ``location_retention_days``, and clear the last-known position kept on any
    session whose newest point is that old. Counts only are audited; no
    coordinates are ever logged."""
    settings = get_settings()
    reference = ensure_utc(now) if now is not None else utcnow()
    cutoff = reference - timedelta(days=settings.location_retention_days)

    points = db.execute(delete(LocationPoint).where(LocationPoint.recorded_at < cutoff)).rowcount or 0
    alerts = db.execute(delete(PoiAlert).where(PoiAlert.shown_at < cutoff)).rowcount or 0
    db.execute(
        update(VisitSession)
        .where(VisitSession.last_point_at < cutoff)
        .values(last_point_at=None, last_latitude=None, last_longitude=None, last_accuracy=None)
    )
    if points or alerts:
        record_audit(
            db,
            action="location_retention",
            entity_type="location_point",
            details={"points_deleted": points, "alerts_deleted": alerts},
        )
    db.flush()
    return LocationRetentionResult(cutoff=cutoff, points_deleted=points, alerts_deleted=alerts)
