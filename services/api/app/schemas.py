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
