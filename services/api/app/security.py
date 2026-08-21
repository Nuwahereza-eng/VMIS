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


def create_access_token(subject: str, role: str, station_id: str | None) -> str:
    settings = get_settings()
    now = utcnow()
    payload = {
        "sub": subject,
        "role": role,
        "station_id": station_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and verify a token. Raises ``jwt.PyJWTError`` on any problem."""
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
