"""Password hashing and JWT unit tests."""

import jwt
import pytest

from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_is_not_plaintext_and_verifies():
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert hashed.startswith("$argon2")
    assert verify_password("correct horse battery staple", hashed)


def test_verify_rejects_wrong_password():
    hashed = hash_password("s3cret-password")
    assert not verify_password("wrong-password", hashed)


def test_verify_rejects_malformed_hash():
    assert not verify_password("anything", "not-a-real-hash")


def test_token_round_trip_carries_claims():
    token = create_access_token(subject="user-123", role="management", station_id="GATE-A")
    claims = decode_access_token(token)
    assert claims["sub"] == "user-123"
    assert claims["role"] == "management"
    assert claims["station_id"] == "GATE-A"


def test_token_with_wrong_secret_is_rejected():
    token = create_access_token(subject="user-123", role="management", station_id=None)
    with pytest.raises(jwt.PyJWTError):
        jwt.decode(token, "the-wrong-secret", algorithms=["HS256"])
