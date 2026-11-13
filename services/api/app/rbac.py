"""Role-based access control.

Enforced server-side (build prompt section 11: "RBAC enforced server-side, not
just hidden in the UI"). ``get_current_user`` validates the bearer token and
loads the account; ``require_roles`` builds a dependency that rejects any
caller whose role is not in the allowed set.
"""

import enum
import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.enums import Role
from app.models.user import User
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")
        if subject is None:
            raise _credentials_error
        user_id = uuid.UUID(subject)
    except (jwt.PyJWTError, ValueError):
        raise _credentials_error

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _credentials_error
    return user


def require_roles(*allowed: Role) -> Callable[[User], User]:
    allowed_set = set(allowed)

    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role for this action",
            )
        return current_user

    return _dependency


# --- Permissions (finer than roles) ---
#
# Most endpoints gate on roles. Where the data is sensitive enough to need its
# own switch, a named permission is granted to roles here and checked on the
# server with ``require_permission``.


class Permission(str, enum.Enum):
    # See where visitors are (tour tracking live view, paths, busy areas).
    VIEW_VISITOR_LOCATIONS = "view_visitor_locations"


ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.MANAGEMENT: frozenset({Permission.VIEW_VISITOR_LOCATIONS}),
}


def has_permission(user: User, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS.get(user.role, frozenset())


def require_permission(permission: Permission) -> Callable[[User], User]:
    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if not has_permission(current_user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission.value}",
            )
        return current_user

    return _dependency
