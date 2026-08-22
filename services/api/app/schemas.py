"""Pydantic request/response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Role, VisitorCategory


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    role: Role
    full_name: str | None = Field(default=None, max_length=128)
    station_id: str | None = Field(default=None, max_length=64)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    role: Role
    full_name: str | None
    station_id: str | None
    is_active: bool


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


class CountOut(BaseModel):
    label: str
    count: int


class StationSyncOut(BaseModel):
    station_id: str
    last_sync_at: datetime
    operations: int


class DashboardOut(BaseModel):
    inside_now: int
    by_gate: list[CountOut]
    by_category: list[CountOut]
    by_activity: list[CountOut]
    by_lodge: list[CountOut]
    revenue: list[CurrencyTotal]
    stations: list[StationSyncOut]
    alert_counts: list[CountOut]


class ReportRowOut(BaseModel):
    period: str
    visitors_registered: int
    entries: int
    activities: int
    revenue: list[CurrencyTotal]


class ReportOut(BaseModel):
    granularity: str
    start: datetime
    end: datetime
    rows: list[ReportRowOut]


class RetentionResultOut(BaseModel):
    cutoff: datetime
    redacted: int
    retention_days: int
