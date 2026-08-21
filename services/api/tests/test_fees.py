"""Fee computation and tariff-seed tests (Sprint 4)."""

import pytest

from app.fees import RateNotFound, quote_activity_fee
from app.models.activity import Activity, ActivityRate
from app.models.enums import VisitorCategory
from app.seed import seed_tariff


def test_seed_is_idempotent(db_session):
    first = seed_tariff(db_session)
    second = seed_tariff(db_session)
    assert first == second
    count = db_session.query(Activity).count()
    assert count == first
    # Re-seeding must not duplicate activities.
    assert db_session.query(Activity).filter(Activity.code == "park_entrance").count() == 1


def test_seed_marks_wildlife_clubs_free(db_session):
    seed_tariff(db_session)
    clubs = db_session.query(Activity).filter(Activity.code == "wildlife_clubs").one()
    assert clubs.is_free is True
    # A free activity has no rate rows.
    assert db_session.query(ActivityRate).filter(ActivityRate.activity_id == clubs.id).count() == 0


def test_free_activity_quotes_zero_in_category_currency(db_session):
    seed_tariff(db_session)
    clubs = db_session.query(Activity).filter(Activity.code == "wildlife_clubs").one()
    quote = quote_activity_fee(db_session, clubs, VisitorCategory.EAC, quantity=3)
    assert quote.amount_minor == 0
    assert quote.unit_amount_minor == 0
    assert quote.currency == "UGX"


def test_paid_activity_multiplies_by_quantity(db_session):
    seed_tariff(db_session)
    drive = db_session.query(Activity).filter(Activity.code == "day_game_drive").one()
    rate = (
        db_session.query(ActivityRate)
        .filter(ActivityRate.activity_id == drive.id, ActivityRate.category == VisitorCategory.FNR)
        .one()
    )
    quote = quote_activity_fee(db_session, drive, VisitorCategory.FNR, quantity=2)
    assert quote.unit_amount_minor == rate.amount_minor
    assert quote.amount_minor == rate.amount_minor * 2
    assert quote.currency == "USD"


def test_eac_is_billed_in_ugx(db_session):
    seed_tariff(db_session)
    entrance = db_session.query(Activity).filter(Activity.code == "park_entrance").one()
    quote = quote_activity_fee(db_session, entrance, VisitorCategory.EAC, quantity=1)
    assert quote.currency == "UGX"


def test_missing_rate_raises(db_session):
    # A paid activity with no rate rows must raise rather than guess a price.
    orphan = Activity(code="orphan", name="Orphan", is_free=False)
    db_session.add(orphan)
    db_session.commit()
    with pytest.raises(RateNotFound):
        quote_activity_fee(db_session, orphan, VisitorCategory.FNR, quantity=1)


def test_quantity_must_be_positive(db_session):
    seed_tariff(db_session)
    entrance = db_session.query(Activity).filter(Activity.code == "park_entrance").one()
    with pytest.raises(ValueError):
        quote_activity_fee(db_session, entrance, VisitorCategory.FNR, quantity=0)


def test_amounts_are_integers(db_session):
    seed_tariff(db_session)
    entrance = db_session.query(Activity).filter(Activity.code == "park_entrance").one()
    quote = quote_activity_fee(db_session, entrance, VisitorCategory.FR, quantity=1)
    assert isinstance(quote.amount_minor, int)
    assert isinstance(quote.unit_amount_minor, int)
