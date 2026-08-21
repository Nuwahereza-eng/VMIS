"""Ticket validity engine unit tests (build prompt Table 4)."""

from datetime import datetime, timedelta, timezone

from app.tickets import TicketStatus, compute_expiry, compute_validity

ENTRY = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def test_expiry_is_entry_plus_nights_times_24h():
    assert compute_expiry(ENTRY, 1) == ENTRY + timedelta(hours=24)
    assert compute_expiry(ENTRY, 3) == ENTRY + timedelta(hours=72)


def test_active_before_expiry():
    now = ENTRY + timedelta(hours=23)
    v = compute_validity(ENTRY, 1, now=now)
    assert v.status is TicketStatus.ACTIVE
    assert v.remaining_seconds == 3600


def test_expired_after_expiry():
    now = ENTRY + timedelta(hours=25)
    v = compute_validity(ENTRY, 1, now=now)
    assert v.status is TicketStatus.EXPIRED
    assert v.remaining_seconds == 0


def test_boundary_exactly_at_expiry_is_expired():
    # status = Active if now < expiry; at expiry it is not Active.
    now = ENTRY + timedelta(hours=24)
    v = compute_validity(ENTRY, 1, now=now)
    assert v.status is TicketStatus.EXPIRED
    assert v.remaining_seconds == 0


def test_remaining_never_negative():
    now = ENTRY + timedelta(days=10)
    v = compute_validity(ENTRY, 1, now=now)
    assert v.remaining_seconds == 0
