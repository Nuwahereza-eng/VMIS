"""Pydantic request/response schemas."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import (
    BookingStatus,
    PaymentStatus,
    Role,
    ScanKind,
    VisitorCategory,
    VisitorStatus,
)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    role: Role
    full_name: str | None = Field(default=None, max_length=128)
    station_id: str | None = Field(default=None, max_length=64)


class UserUpdate(BaseModel):
    # All fields optional: only the ones supplied are changed. An empty/omitted
    # password leaves the existing credential untouched.
    username: str | None = Field(default=None, min_length=3, max_length=64)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: Role | None = None
    full_name: str | None = Field(default=None, max_length=128)
    station_id: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None



class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    role: Role
    full_name: str | None
    station_id: str | None
    is_active: bool


class TouristRegister(BaseModel):
    """Public self-service sign-up. The account is always a tourist; the role
    is never taken from the client, so this endpoint can't mint an officer."""

    email: str = Field(min_length=3, max_length=128)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _normalise_email(cls, value: str) -> str:
        email = value.strip().lower()
        # Minimal shape check (no email gateway to verify deliverability). A
        # single '@' with something on either side and a dot in the domain.
        local, _, domain = email.partition("@")
        if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
            raise ValueError("Enter a valid email address")
        return email


# --- Sprint 2: registration + identification ---


class VisitorCreate(BaseModel):
    # Clients generate the identifier at the station so concurrent offline
    # registrations cannot collide; the server accepts it as submitted. Omitting
    # it lets the server generate one for simple online use.
    id: uuid.UUID | None = None
    full_name: str = Field(min_length=1, max_length=128)
    id_number: str = Field(min_length=1, max_length=64)
    nationality: str | None = Field(default=None, max_length=64)
    category: VisitorCategory
    # Extended profile (build prompt section 8.A); all optional.
    country: str | None = Field(default=None, max_length=64)
    age_category: str | None = Field(default=None, max_length=16)
    gender: str | None = Field(default=None, max_length=16)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=128)
    tour_company: str | None = Field(default=None, max_length=128)
    vehicle_registration: str | None = Field(default=None, max_length=32)
    num_visitors: int = Field(default=1, ge=1, le=999)
    guide_name: str | None = Field(default=None, max_length=128)
    # A privacy notice must be shown and acknowledged at registration
    # (Data Protection and Privacy Act, 2019).
    privacy_notice_accepted: bool
    # Offline capture fields; default to the officer's station server-side.
    origin_station_id: str | None = Field(default=None, max_length=64)
    client_created_at: datetime | None = None


class VisitorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    id_number: str
    nationality: str | None
    category: VisitorCategory
    country: str | None = None
    age_category: str | None = None
    gender: str | None = None
    phone: str | None = None
    email: str | None = None
    tour_company: str | None = None
    vehicle_registration: str | None = None
    num_visitors: int = 1
    guide_name: str | None = None
    privacy_notice_accepted: bool
    origin_station_id: str | None
    server_received_at: datetime | None


class VisitorListItem(VisitorOut):
    # Whether the visitor currently has an open (un-exited) visit.
    is_inside: bool = False
    # How many visits this visitor has on record.
    visit_count: int = 0


class VisitorListOut(BaseModel):
    # Total matching the filter (for pagination), and the current page of rows.
    total: int
    items: list[VisitorListItem] = Field(default_factory=list)


class VisitorLookupItem(BaseModel):
    """Minimal visitor projection for the officer-facing service picker.

    Deliberately excludes contact details and other extended PII: officers only
    need enough to identify the right person when assigning an activity or
    accommodation. The full park-wide registry stays management-only.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    id_number: str
    category: VisitorCategory
    is_inside: bool = False


class VisitorLookupOut(BaseModel):
    items: list[VisitorLookupItem] = Field(default_factory=list)



class DuplicateMatch(BaseModel):
    id: uuid.UUID
    full_name: str
    id_number: str


class RegistrationResult(BaseModel):
    visitor: VisitorOut
    # True when this exact identifier already existed (idempotent replay of an
    # offline write); no new record was created.
    idempotent: bool = False
    # Non-blocking warning: other records share this id_number + name
    # (build prompt section 4.1). The officer decides how to proceed.
    duplicate_warning: list[DuplicateMatch] = Field(default_factory=list)


class VerifyRequest(BaseModel):
    # The raw string decoded from the scanned QR code.
    payload: str = Field(min_length=1, max_length=128)


class VerifyResult(BaseModel):
    found: bool
    visitor: VisitorOut | None = None


# --- Sprint 3: entry/exit + ticket validity ---


class EntryCreate(BaseModel):
    # Client-supplied station UUID for idempotent offline replay; omit to let
    # the server generate one.
    id: uuid.UUID | None = None
    visitor_id: uuid.UUID
    ticket_number: str = Field(min_length=1, max_length=64)
    # A ticket is valid for at least its entry day (expiry = entry + nights x 24h).
    nights_purchased: int = Field(ge=1, le=365)
    # Defaults server-side to the officer's gate and the current time.
    entry_gate: str | None = Field(default=None, max_length=64)
    entry_timestamp: datetime | None = None
    origin_station_id: str | None = Field(default=None, max_length=64)
    client_created_at: datetime | None = None


class ExitCreate(BaseModel):
    # Defaults server-side to the officer's gate and the current time.
    exit_gate: str | None = Field(default=None, max_length=64)
    exit_timestamp: datetime | None = None


class TicketInfo(BaseModel):
    """Derived on every request, never stored (build prompt Table 4)."""

    expiry: datetime
    status: str
    remaining_seconds: int


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    visitor_id: uuid.UUID
    entry_gate: str
    entry_timestamp: datetime
    ticket_number: str
    nights_purchased: int
    exit_gate: str | None
    exit_timestamp: datetime | None
    is_open: bool
    origin_station_id: str | None
    server_received_at: datetime | None
    ticket: TicketInfo


class EntryResult(BaseModel):
    visit: VisitOut
    # True when this exact entry id already existed (idempotent offline replay).
    idempotent: bool = False
    # Non-blocking warning: the visitor already had an open visit when this
    # entry was recorded (possible duplicate entry, build prompt section 4.1).
    duplicate_open_visit: bool = False


# --- Sprint 4: activities, fees, accommodation ---


class ActivityRateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: VisitorCategory
    amount_minor: int
    currency: str


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    is_free: bool
    is_active: bool


class ActivityCatalogueEntry(ActivityOut):
    rates: list[ActivityRateOut] = Field(default_factory=list)


class ActivityRateInput(BaseModel):
    # Currency is derived from the category (CATEGORY_CURRENCY), so callers only
    # supply the amount in integer minor units.
    category: VisitorCategory
    amount_minor: int = Field(ge=0)


class ActivityCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    is_free: bool = False
    is_active: bool = True
    rates: list[ActivityRateInput] = Field(default_factory=list)


class ActivityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    is_free: bool | None = None
    is_active: bool | None = None


class GateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool


class GateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    is_active: bool = True


class GateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    is_active: bool | None = None


class FacilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool


class FacilityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    is_active: bool = True


class FacilityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    is_active: bool | None = None


class VisitorActivityCreate(BaseModel):
    # Client-supplied station UUID for idempotent offline replay; omit to let
    # the server generate one.
    id: uuid.UUID | None = None
    activity_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=1000)
    origin_station_id: str | None = Field(default=None, max_length=64)
    client_created_at: datetime | None = None


class VisitorActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    visitor_id: uuid.UUID
    activity_id: uuid.UUID
    category: VisitorCategory
    quantity: int
    unit_amount_minor: int
    amount_minor: int
    currency: str


class VisitorActivityResult(BaseModel):
    activity: VisitorActivityOut
    idempotent: bool = False


class AccommodationCreate(BaseModel):
    id: uuid.UUID | None = None
    facility: str = Field(min_length=1, max_length=128)
    nights: int = Field(ge=1, le=365)
    origin_station_id: str | None = Field(default=None, max_length=64)
    client_created_at: datetime | None = None


class AccommodationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    visitor_id: uuid.UUID
    facility: str
    nights: int


class AccommodationResult(BaseModel):
    accommodation: AccommodationOut
    idempotent: bool = False


# --- Supervisor priority 3: visitor status lifecycle + checkpoint scanning ---


class ScanCreate(BaseModel):
    id: uuid.UUID | None = None
    kind: ScanKind
    # Scan-point label (gate or checkpoint name). Defaults server-side to the
    # officer's station when omitted.
    location: str | None = Field(default=None, max_length=128)
    scanned_at: datetime | None = None
    origin_station_id: str | None = Field(default=None, max_length=64)
    client_created_at: datetime | None = None


class ScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    visitor_id: uuid.UUID
    visit_id: uuid.UUID | None
    kind: ScanKind
    location: str
    scanned_at: datetime
    officer_id: uuid.UUID | None
    origin_station_id: str | None


class ScanResult(BaseModel):
    scan: ScanOut
    # True when this exact scan id already existed (idempotent replay).
    idempotent: bool = False
    # The visitor's recomputed status after this scan.
    status: "VisitorStatusOut"


class VisitorStatusOut(BaseModel):
    """Derived lifecycle status of a visitor (never stored)."""

    visitor_id: uuid.UUID
    status: VisitorStatus
    # "pre_booked" if a booking was matched to this visitor, else "walk_in".
    origin: str = "walk_in"
    # Latest scan, if any.
    last_scan: ScanOut | None = None
    # Open visit ticket state, if the visitor is currently on a ticket.
    ticket: TicketInfo | None = None
    # Total scans recorded for the visitor.
    scan_count: int = 0


# --- Supervisor priority 2: pre-booking / expression of interest ---


class BookingCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=128)
    intended_date: date
    country: str | None = Field(default=None, max_length=64)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=128)
    tour_company: str | None = Field(default=None, max_length=128)
    category: VisitorCategory | None = None
    party_size: int = Field(default=1, ge=1, le=500)
    expected_gate: str | None = Field(default=None, max_length=64)
    length_of_stay_nights: int = Field(default=1, ge=1, le=365)
    accommodation: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=500)


class BookingUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=128)
    intended_date: date | None = None
    country: str | None = Field(default=None, max_length=64)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=128)
    tour_company: str | None = Field(default=None, max_length=128)
    category: VisitorCategory | None = None
    party_size: int | None = Field(default=None, ge=1, le=500)
    expected_gate: str | None = Field(default=None, max_length=64)
    length_of_stay_nights: int | None = Field(default=None, ge=1, le=365)
    accommodation: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=500)
    status: BookingStatus | None = None
    visitor_id: uuid.UUID | None = None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    intended_date: date
    country: str | None
    phone: str | None
    email: str | None
    tour_company: str | None
    category: VisitorCategory | None
    party_size: int
    expected_gate: str | None
    length_of_stay_nights: int
    accommodation: str | None
    notes: str | None
    status: BookingStatus
    visitor_id: uuid.UUID | None
    arrived_at: datetime | None
    created_at: datetime

    # Payment & ticketing (supervisor priority 5).
    amount_minor: int | None
    currency: str | None
    payment_status: PaymentStatus
    payment_method: str | None
    payment_reference: str | None
    paid_at: datetime | None
    ticket_code: str | None


class BookingPay(BaseModel):
    """Simulated payment for a booking's entry fee.

    No external gateway is called; the payment always succeeds and the server
    mints a ticket. ``method`` records how the visitor chose to pay so revenue
    can be broken down by channel.
    """

    method: Literal["mobile_money", "card", "cash"] = "mobile_money"
    # Optional payer detail shown on the receipt (e.g. a masked phone/card).
    payer_reference: str | None = Field(default=None, max_length=64)


class ExpectedDay(BaseModel):
    """Count of expected (not-yet-arrived) visitors on one date."""

    intended_date: date
    bookings: int
    expected_visitors: int


class CurrencyTotal(BaseModel):
    currency: str
    amount_minor: int


class VisitorChargesSummary(BaseModel):
    visitor_id: uuid.UUID
    activities: list[VisitorActivityOut]
    accommodations: list[AccommodationOut]
    # Fees can span currencies (USD activities, UGX activities), so totals are
    # reported per currency; money is never summed across currencies.
    totals: list[CurrencyTotal]


# --- Sprint 5: synchronisation ---

# Entity types a station may write offline and later sync.
SyncEntityType = Literal[
    "visitor",
    "visit",
    "visit_exit",
    "visitor_activity",
    "accommodation",
]


class SyncOp(BaseModel):
    # Client-generated operation id: the idempotency key for replay.
    op_id: uuid.UUID
    entity_type: SyncEntityType
    # For mutations (visit_exit) the target record id; for creates the payload
    # carries its own station-generated id.
    entity_id: uuid.UUID | None = None
    payload: dict = Field(default_factory=dict)


class SyncBatchRequest(BaseModel):
    station_id: str | None = Field(default=None, max_length=64)
    operations: list[SyncOp] = Field(default_factory=list, max_length=1000)


class SyncOpResult(BaseModel):
    op_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID | None = None
    # applied  = new record/mutation written
    # exists   = record already present, treated idempotently (no change)
    # duplicate = this op_id was already processed on an earlier upload
    # conflict = business-rule violation, written to the exceptions list
    result: Literal["applied", "exists", "duplicate", "conflict"]
    exception_kind: str | None = None


class SyncBatchResult(BaseModel):
    processed: int
    applied: int
    duplicates: int
    conflicts: int
    results: list[SyncOpResult]


class SyncExceptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    station_id: str | None
    entity_type: str
    entity_id: str | None
    kind: str
    detail: str | None
    resolved: bool
    created_at: datetime


# --- Sprint 6: dashboard, alerts, reporting, retention ---


class AlertOut(BaseModel):
    kind: str
    visit_id: uuid.UUID
    visitor_id: uuid.UUID
    entry_gate: str
    entry_timestamp: datetime
    detail: str
    visitor_name: str | None = None
    visitor_category: str | None = None
    nationality: str | None = None
    ticket_number: str | None = None
    nights_purchased: int | None = None
    expiry_timestamp: datetime | None = None


class CountOut(BaseModel):
    label: str
    count: int


class StationSyncOut(BaseModel):
    station_id: str
    last_sync_at: datetime
    operations: int


class OriginRevenueOut(BaseModel):
    origin: str
    totals: list[CurrencyTotal]


class DashboardOut(BaseModel):
    inside_now: int
    entered_today: int = 0
    exited_today: int = 0
    expired_tickets: int = 0
    average_stay_hours: float = 0.0
    by_gate: list[CountOut]
    by_category: list[CountOut]
    by_activity: list[CountOut]
    by_lodge: list[CountOut]
    by_origin: list[CountOut] = Field(default_factory=list)
    revenue: list[CurrencyTotal]
    revenue_today: list[CurrencyTotal] = Field(default_factory=list)
    revenue_by_origin: list[OriginRevenueOut] = Field(default_factory=list)
    stations: list[StationSyncOut]
    alert_counts: list[CountOut]


class ReportRowOut(BaseModel):
    period: str
    visitors_registered: int
    entries: int
    pre_booked: int = 0
    walk_in: int = 0
    activities: int
    revenue: list[CurrencyTotal]
    revenue_pre_booked: list[CurrencyTotal] = Field(default_factory=list)
    revenue_walk_in: list[CurrencyTotal] = Field(default_factory=list)


class ReportOut(BaseModel):
    granularity: str
    start: datetime
    end: datetime
    rows: list[ReportRowOut]


class GateReconciliationOut(BaseModel):
    gate: str
    expected: int = 0
    entries: int = 0
    distinct_visitors: int = 0
    inside_now: int = 0
    exited: int = 0
    revenue: list[CurrencyTotal] = Field(default_factory=list)


class ReconciliationOut(BaseModel):
    gates: list[GateReconciliationOut] = Field(default_factory=list)
    totals: list[CurrencyTotal] = Field(default_factory=list)
    unassigned_revenue: list[CurrencyTotal] = Field(default_factory=list)
    total_expected: int = 0
    total_entries: int = 0
    total_inside: int = 0
    total_exited: int = 0


class ReminderItemOut(BaseModel):
    booking_id: str
    full_name: str
    intended_date: date
    days_until: int
    kind: str
    label: str
    party_size: int
    expected_gate: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    contactable: bool = False


class RemindersOut(BaseModel):
    reference_date: date
    due_now: list[ReminderItemOut] = Field(default_factory=list)
    upcoming: list[ReminderItemOut] = Field(default_factory=list)
    overdue: list[ReminderItemOut] = Field(default_factory=list)
    week_before_count: int = 0
    day_before_count: int = 0


class RetentionResultOut(BaseModel):
    cutoff: datetime
    redacted: int
    retention_days: int
