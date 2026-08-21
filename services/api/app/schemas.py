"""Pydantic request/response schemas."""

import uuid
from datetime import datetime

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
