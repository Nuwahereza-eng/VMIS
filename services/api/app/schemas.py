"""Pydantic request/response schemas for Sprint 1 (auth + users)."""

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Role


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
