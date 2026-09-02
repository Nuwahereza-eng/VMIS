"""First-run bootstrap of a single management account.

Only runs when the users table is empty, so it never clobbers real accounts.
Credentials come from the environment; the account should be rotated
immediately after first login.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.config import get_settings
from app.models.enums import Role
from app.models.user import User
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
