"""User administration routes. Management role only."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.enums import Role
from app.models.user import User
from app.rbac import require_roles
from app.schemas import UserCreate, UserOut
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.MANAGEMENT)),
) -> User:
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        station_id=payload.station_id,
    )
    db.add(user)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="user",
        entity_id=str(user.id),
        actor_user_id=actor.id,
        details={"role": user.role.value, "station_id": user.station_id},
    )
    return user


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.MANAGEMENT)),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.username)))
