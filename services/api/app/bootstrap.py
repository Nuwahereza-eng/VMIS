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
