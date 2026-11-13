"""Password hashing (Argon2) and JWT access tokens.

Argon2id is used directly via argon2-cffi. JWTs are signed HS256 with the
configured secret. No plaintext password is ever stored, returned, or logged.
"""

from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.config import get_settings
from app.models.base import utcnow

_ph = PasswordHasher()
_ALGORITHM = "HS256"


def hash_password(plaintext: str) -> str:
    return _ph.hash(plaintext)


def verify_password(plaintext: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, plaintext)
    except (VerifyMismatchError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _ph.check_needs_rehash(password_hash)


def create_access_token(
    subject: str,
    role: str,
    station_id: str | None,
    username: str | None = None,
    name: str | None = None,
) -> str:
    settings = get_settings()
    now = utcnow()
    payload = {
        "sub": subject,
        "role": role,
        "station_id": station_id,
        "username": username,
        "name": name,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and verify a token. Raises ``jwt.PyJWTError`` on any problem."""
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])


# --- Visitor tour tokens (tracking feature) ---
#
# A visitor's phone never holds a staff login. It holds a token signed by the
# server for exactly one ticket, valid until that ticket expires. The distinct
# audience makes the two kinds of token mutually exclusive: staff endpoints
# (which decode without an audience) reject a tour token, and the tour endpoints
# reject a staff token.

TOUR_AUDIENCE = "vmis-tour"


def create_tour_token(ticket_kind: str, ticket_id: str, expires_at) -> str:
    settings = get_settings()
    payload = {
        "sub": f"{ticket_kind}:{ticket_id}",
        "aud": TOUR_AUDIENCE,
        "iat": int(utcnow().timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_tour_token(token: str) -> tuple[str, str]:
    """Return (ticket_kind, ticket_id). Raises ``jwt.PyJWTError`` on any problem."""
    settings = get_settings()
    payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM], audience=TOUR_AUDIENCE)
    kind, _, ticket_id = str(payload.get("sub", "")).partition(":")
    if kind not in ("visit", "booking") or not ticket_id:
        raise jwt.InvalidTokenError("Malformed tour token subject")
    return kind, ticket_id
