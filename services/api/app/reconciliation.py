"""Cross-gate revenue and visitor reconciliation (supervisor priority 4).

Murchison Falls is entered through several gates and ferry points, and payments
and entries are recorded separately for each one. Management needs to reconcile
both visitor numbers and revenue across every gate: how many were expected, how
many actually entered, how many are still inside, how many have exited, and how
much money each gate accounts for.

Revenue lives on ``VisitorActivity`` (per visitor, per currency) and gates live
on ``Visit.entry_gate``. To attribute money to a gate we map each activity to
the visit whose time window contains it; failing that, to the nearest prior
visit, and finally to the visitor's first visit. Activity revenue for a visitor
who never entered the park is reported as "unassigned" rather than silently
dropped, so the per-gate totals always reconcile back to the grand total.

Everything is derived on request from the system of record; nothing is cached.
Money is kept per currency and never summed across currencies.
"""

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import ensure_utc, utcnow
from app.models.booking import VisitorActivity
from app.models.booking_request import Booking
from app.models.enums import BookingStatus
from app.models.visit import Visit

UNASSIGNED = "Unassigned"


@dataclass
class CurrencyTotal:
    currency: str
    amount_minor: int


@dataclass
class GateReconciliation:
    gate: str
    expected: int = 0        # party size still expected (pending bookings) at this gate
    entries: int = 0         # visits that entered at this gate
    distinct_visitors: int = 0
    inside_now: int = 0      # open visits at this gate
    exited: int = 0          # visits at this gate that have left
    revenue: list[CurrencyTotal] = field(default_factory=list)


@dataclass
class Reconciliation:
    gates: list[GateReconciliation] = field(default_factory=list)
    totals: list[CurrencyTotal] = field(default_factory=list)
    unassigned_revenue: list[CurrencyTotal] = field(default_factory=list)
    total_expected: int = 0
    total_entries: int = 0
    total_inside: int = 0
    total_exited: int = 0


def _sorted_totals(bucket: dict[str, int]) -> list[CurrencyTotal]:
    return [CurrencyTotal(currency=c, amount_minor=a) for c, a in sorted(bucket.items())]


def build_reconciliation(db: Session, now: datetime | None = None) -> Reconciliation:
    _ = ensure_utc(now) if now is not None else utcnow()

    visits = db.scalars(select(Visit)).all()

    # Group a visitor's visits by entry time so activity revenue can be matched
    # to the gate that was in effect when the charge was made.
    visits_by_visitor: dict[object, list[Visit]] = {}
    for visit in visits:
        visits_by_visitor.setdefault(visit.visitor_id, []).append(visit)
    for group in visits_by_visitor.values():
        group.sort(key=lambda v: ensure_utc(v.entry_timestamp))

    def gate_for_activity(visitor_id: object, when: datetime) -> str | None:
        group = visits_by_visitor.get(visitor_id)
        if not group:
            return None
        moment = ensure_utc(when)
        for visit in group:
            entry = ensure_utc(visit.entry_timestamp)
            exit_ts = ensure_utc(visit.exit_timestamp) if visit.exit_timestamp else None
            if entry <= moment and (exit_ts is None or moment <= exit_ts):
                return visit.entry_gate
        prior = [v for v in group if ensure_utc(v.entry_timestamp) <= moment]
        if prior:
            return prior[-1].entry_gate
        return group[0].entry_gate

    # Per-gate visitor movement.
    gate_entries: dict[str, int] = {}
    gate_inside: dict[str, int] = {}
    gate_exited: dict[str, int] = {}
    gate_visitors: dict[str, set] = {}
    for visit in visits:
        gate = visit.entry_gate
        gate_entries[gate] = gate_entries.get(gate, 0) + 1
        gate_visitors.setdefault(gate, set()).add(visit.visitor_id)
        if visit.exit_timestamp is None:
            gate_inside[gate] = gate_inside.get(gate, 0) + 1
        else:
            gate_exited[gate] = gate_exited.get(gate, 0) + 1

    # Expected visitors per gate from still-pending bookings.
    gate_expected: dict[str, int] = {}
    for gate, party in db.execute(
        select(Booking.expected_gate, Booking.party_size).where(
            Booking.status == BookingStatus.PENDING
        )
    ).all():
        key = gate or UNASSIGNED
        gate_expected[key] = gate_expected.get(key, 0) + int(party or 0)

    # Attribute revenue to gates (or to "unassigned" when no visit matches).
    gate_revenue: dict[str, dict[str, int]] = {}
    unassigned_revenue: dict[str, int] = {}
    grand_total: dict[str, int] = {}
    for visitor_id, created_at, currency, amount in db.execute(
        select(
            VisitorActivity.visitor_id,
            VisitorActivity.created_at,
            VisitorActivity.currency,
            VisitorActivity.amount_minor,
        )
    ).all():
        value = int(amount or 0)
        grand_total[currency] = grand_total.get(currency, 0) + value
        gate = gate_for_activity(visitor_id, created_at)
        if gate is None:
            unassigned_revenue[currency] = unassigned_revenue.get(currency, 0) + value
        else:
            bucket = gate_revenue.setdefault(gate, {})
            bucket[currency] = bucket.get(currency, 0) + value

    all_gates = (
        set(gate_entries)
        | set(gate_revenue)
        | {g for g in gate_expected if g != UNASSIGNED}
    )

    gates = [
        GateReconciliation(
            gate=gate,
            expected=gate_expected.get(gate, 0),
            entries=gate_entries.get(gate, 0),
            distinct_visitors=len(gate_visitors.get(gate, set())),
            inside_now=gate_inside.get(gate, 0),
            exited=gate_exited.get(gate, 0),
            revenue=_sorted_totals(gate_revenue.get(gate, {})),
        )
        for gate in sorted(all_gates)
    ]

    return Reconciliation(
        gates=gates,
        totals=_sorted_totals(grand_total),
        unassigned_revenue=_sorted_totals(unassigned_revenue),
        total_expected=sum(gate_expected.values()),
        total_entries=sum(gate_entries.values()),
        total_inside=sum(gate_inside.values()),
        total_exited=sum(gate_exited.values()),
    )
