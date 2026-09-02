"""First-run bootstrap of a single management account.

Only runs when the users table is empty, so it never clobbers real accounts.
Credentials come from the environment; the account should be rotated
immediately after first login.
"""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.config import get_settings
from app.models.base import utcnow
from app.models.enums import Role, VisitorCategory
from app.models.user import User
from app.models.visit import Visit
from app.models.visitor import Visitor
from app.security import hash_password


def bootstrap_admin(db: Session) -> User | None:
    settings = get_settings()
    if not settings.bootstrap_admin_username or not settings.bootstrap_admin_password:
        return None

    user_count = db.scalar(select(func.count()).select_from(User))
    if user_count:
        return None

    admin = User(
        username=settings.bootstrap_admin_username,
        password_hash=hash_password(settings.bootstrap_admin_password),
        full_name="System Administrator",
        role=Role.MANAGEMENT,
    )
    db.add(admin)
    db.flush()
    record_audit(db, action="create", entity_type="user", entity_id=str(admin.id), details={"bootstrap": True})
    db.commit()
    return admin


# Fixed demo accounts matching the login screen's one-tap role buttons. Used
# only for public demo deployments (VMIS_SEED_DEMO_USERS=true). Passwords are
# intentionally well-known — never enable this for a real deployment.
_DEMO_USERS = [
    ("admin", "change-me-now", "System Administrator", Role.MANAGEMENT, None),
    ("gate1", "gate-pass-1", "Gate Officer (Demo)", Role.GATE_OFFICER, "tangi-gate"),
    ("activity1", "activity-pass-1", "Activity Officer (Demo)", Role.ACTIVITY_OFFICER, "paraa-hq"),
]


def seed_demo_users(db: Session) -> list[User]:
    """Ensure the fixed demo accounts exist with their known credentials.

    Idempotent. When demo mode is on, an existing demo account is reset to the
    expected password/role/station so the login screen's one-tap buttons always
    work — including ``admin``, which a prior bootstrap may have created with a
    different password. Only ever runs when VMIS_SEED_DEMO_USERS is true, so it
    cannot touch a real deployment.
    """
    settings = get_settings()
    if not settings.seed_demo_users:
        return []

    touched: list[User] = []
    for username, password, full_name, role, station_id in _DEMO_USERS:
        existing = db.scalar(select(User).where(User.username == username))
        if existing is not None:
            # Reset to the known demo state (password may have drifted).
            existing.password_hash = hash_password(password)
            existing.full_name = full_name
            existing.role = role
            existing.station_id = station_id
            existing.is_active = True
            db.flush()
            record_audit(
                db,
                action="update",
                entity_type="user",
                entity_id=str(existing.id),
                details={"demo_seed": True, "reset": True},
            )
            touched.append(existing)
            continue
        user = User(
            username=username,
            password_hash=hash_password(password),
            full_name=full_name,
            role=role,
            station_id=station_id,
        )
        db.add(user)
        db.flush()
        record_audit(
            db, action="create", entity_type="user", entity_id=str(user.id), details={"demo_seed": True}
        )
        touched.append(user)

    if touched:
        db.commit()
    return touched


# Sample visitors + visits so a fresh demo deployment isn't an empty shell.
# ``days_ago`` is the entry offset from now; ``nights`` the ticket length;
# ``closed`` marks a visitor who has already exited (else the stay is open).
_DEMO_VISITS = [
    ("Amina Okello", "CM1029384", "Uganda", VisitorCategory.EAC, "tangi-gate", 0, 2, 4, False),
    ("James Whitfield", "P8837123", "United Kingdom", VisitorCategory.FNR, "tangi-gate", 1, 3, 2, False),
    ("Grace Mwangi", "KE5567129", "Kenya", VisitorCategory.EAC, "paraa-gate", 2, 1, 1, True),
    ("Liam O'Connor", "IE4491002", "Ireland", VisitorCategory.FNR, "tangi-gate", 3, 4, 3, False),
    ("Fatima Diallo", "SN2210934", "Senegal", VisitorCategory.ROA, "paraa-gate", 5, 2, 2, True),
    ("Peter Ssemakula", "CM7781245", "Uganda", VisitorCategory.EAC, "tangi-gate", 0, 1, 6, False),
    ("Sofia Rossi", "IT9902147", "Italy", VisitorCategory.FR, "paraa-gate", 4, 5, 2, True),
]


def seed_demo_visitors(db: Session) -> list[Visitor]:
    """Populate a fresh demo deployment with sample visitors and visits.

    Runs only when VMIS_SEED_DEMO_USERS is on AND the visitors table is empty,
    so it never duplicates rows on restart and never touches a real database.
    """
    settings = get_settings()
    if not settings.seed_demo_users:
        return []

    if db.scalar(select(func.count()).select_from(Visitor)):
        return []

    now = utcnow()
    created: list[Visitor] = []
    for i, (name, id_number, country, category, gate, days_ago, nights, group, closed) in enumerate(
        _DEMO_VISITS
    ):
        entry = now - timedelta(days=days_ago, hours=(i % 5) + 1)
        visitor = Visitor(
            full_name=name,
            id_number=id_number,
            nationality=country,
            country=country,
            category=category,
            num_visitors=group,
            privacy_notice_accepted=True,
            origin_station_id=gate,
            client_created_at=entry,
            server_received_at=entry,
        )
        db.add(visitor)
        db.flush()

        visit = Visit(
            visitor_id=visitor.id,
            entry_gate=gate,
            entry_timestamp=entry,
            ticket_number=f"TKT-{1000 + i}",
            nights_purchased=nights,
            origin_station_id=gate,
            client_created_at=entry,
            server_received_at=entry,
        )
        if closed:
            exit_at = entry + timedelta(days=min(nights, 1), hours=6)
            visit.exit_gate = gate
            visit.exit_timestamp = exit_at if exit_at < now else now
        db.add(visit)
        db.flush()
        record_audit(
            db, action="create", entity_type="visitor", entity_id=str(visitor.id), details={"demo_seed": True}
        )
        created.append(visitor)

    if created:
        db.commit()
    return created
