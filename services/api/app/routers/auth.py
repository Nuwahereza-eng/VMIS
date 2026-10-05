"""Authentication routes: token issue and current-user lookup."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.enums import Role
from app.models.user import User
from app.rbac import get_current_user
from app.schemas import Token, TouristRegister, UserOut
from app.security import create_access_token, needs_rehash, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(
    payload: TouristRegister,
    db: Session = Depends(get_db),
) -> Token:
    """Public self-service sign-up for tourists.

    Anyone can create a tourist account to make and manage their own bookings.
    The role is fixed server-side to ``TOURIST`` — a caller can never request an
    officer/management role here. The email doubles as the username.
    """
    existing = db.scalar(select(User).where(User.username == payload.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        username=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=Role.TOURIST,
        station_id=None,
    )
    db.add(user)
    db.flush()
    record_audit(
        db,
        action="register",
        entity_type="user",
        entity_id=str(user.id),
        actor_user_id=user.id,
        details={"role": Role.TOURIST.value},
    )

    token = create_access_token(
        subject=str(user.id),
        role=user.role.value,
        station_id=user.station_id,
        username=user.username,
        name=user.full_name,
    )
    return Token(access_token=token)


@router.post("/token", response_model=Token)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    user = db.scalar(select(User).where(User.username == form.username))
    # Same generic error whether the user is missing or the password is wrong,
    # to avoid leaking which usernames exist.
    if user is None or not user.is_active or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Transparently upgrade the stored hash if Argon2 parameters have changed.
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(form.password)

    record_audit(db, action="login", entity_type="user", entity_id=str(user.id), actor_user_id=user.id)

    token = create_access_token(
        subject=str(user.id),
        role=user.role.value,
        station_id=user.station_id,
        username=user.username,
        name=user.full_name,
    )
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
