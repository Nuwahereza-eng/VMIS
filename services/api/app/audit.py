"""Helper for writing append-only audit entries."""

import json
import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditEntry


def record_audit(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    details: dict | None = None,
) -> AuditEntry:
    """Append an audit entry. ``details`` must not carry plaintext PII."""
    entry = AuditEntry(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=json.dumps(details, separators=(",", ":")) if details else None,
    )
    db.add(entry)
    return entry
