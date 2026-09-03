"""User administration routes. Management role only."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.enums import Role
from app.models.user import User
from app.rbac import require_roles
from app.schemas import UserCreate, UserOut, UserUpdate
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


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.MANAGEMENT)),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Guard against self-lockout: an admin cannot disable their own account or
    # demote themselves out of management in the same session.
    if user.id == actor.id:
        if payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own account",
            )
        if payload.role is not None and payload.role != Role.MANAGEMENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own role away from management",
            )

    changed: list[str] = []
    if payload.username is not None and payload.username != user.username:
        clash = db.scalar(select(User).where(User.username == payload.username, User.id != user.id))
        if clash is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
        user.username = payload.username
        changed.append("username")
    if payload.full_name is not None:
        user.full_name = payload.full_name
        changed.append("full_name")
    if payload.role is not None:
        user.role = payload.role
        changed.append("role")
    if payload.station_id is not None:
        user.station_id = payload.station_id or None
        changed.append("station_id")
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changed.append("is_active")
    if payload.password:
        user.password_hash = hash_password(payload.password)
        changed.append("password")

    db.flush()
    record_audit(
        db,
        action="update",
        entity_type="user",
        entity_id=str(user.id),
        actor_user_id=actor.id,
        details={"fields": changed},
    )
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.MANAGEMENT)),
) -> Response:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # An admin cannot delete their own account (prevents accidental lockout).
    if user.id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )

    record_audit(
        db,
        action="delete",
        entity_type="user",
        entity_id=str(user.id),
        actor_user_id=actor.id,
        details={"username": user.username, "role": user.role.value},
    )
    db.delete(user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

