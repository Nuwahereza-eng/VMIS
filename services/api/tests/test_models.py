"""Model-level tests: offline-first invariants and the audit trail."""

import uuid
from datetime import datetime, timezone

from app.models.base import utcnow
from app.models.enums import Role, VisitorCategory
from app.models.user import User
from app.models.visitor import Visitor
from app.security import hash_password


def test_visitor_gets_station_generated_uuid(db_session):
    visitor = Visitor(
        full_name="Synthetic Tester",
        id_number="SYN-0001",
        category=VisitorCategory.FNR,
        privacy_notice_accepted=True,
        origin_station_id="GATE-A",
        client_created_at=utcnow(),
    )
    db_session.add(visitor)
    db_session.commit()
    assert isinstance(visitor.id, uuid.UUID)
    assert visitor.server_received_at is None  # not yet merged centrally


def test_two_offline_visitors_do_not_collide(db_session):
    # Simulates two stations registering concurrently while offline.
    a = Visitor(full_name="A", id_number="A1", category=VisitorCategory.EAC, origin_station_id="GATE-A")
    b = Visitor(full_name="B", id_number="B1", category=VisitorCategory.EAC, origin_station_id="GATE-B")
    db_session.add_all([a, b])
    db_session.commit()
    assert a.id != b.id


def test_timestamps_are_timezone_aware_utc(db_session):
    user = User(
        username="tz-check",
        password_hash=hash_password("passwordpassword"),
        role=Role.MANAGEMENT,
    )
    db_session.add(user)
    db_session.commit()
    assert user.created_at.tzinfo is not None
    assert user.created_at.utcoffset() == timezone.utc.utcoffset(datetime.now())


def test_visitor_category_persists_as_string(db_session):
    visitor = Visitor(full_name="C", id_number="C1", category=VisitorCategory.ROA)
    db_session.add(visitor)
    db_session.commit()
    reloaded = db_session.get(Visitor, visitor.id)
    assert reloaded.category is VisitorCategory.ROA
