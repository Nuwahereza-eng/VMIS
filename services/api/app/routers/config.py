"""Management configuration: park gates and accommodation facilities.

These are editable master lists (build prompt section 8). They are not
foreign-keyed from visits/accommodations — those store the chosen value as a
string — so a delete never orphans historical data. All endpoints are
management-only. ``is_active`` supports soft-retiring an entry from pickers.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.config import Facility, Gate
from app.models.enums import Role
from app.models.user import User
from app.rbac import require_roles
from app.schemas import (
    FacilityCreate,
    FacilityOut,
    FacilityUpdate,
    GateCreate,
    GateOut,
    GateUpdate,
)

router = APIRouter(prefix="/config", tags=["config"])

_manage_roles = require_roles(Role.MANAGEMENT)


# --- Gates ---------------------------------------------------------------


@router.get("/gates", response_model=list[GateOut])
def list_gates(
    db: Session = Depends(get_db),
    _: User = Depends(_manage_roles),
) -> list[Gate]:
    return list(db.scalars(select(Gate).order_by(Gate.name)))


@router.post("/gates", response_model=GateOut, status_code=status.HTTP_201_CREATED)
def create_gate(
    payload: GateCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> Gate:
    if db.scalar(select(Gate).where(Gate.name == payload.name)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Gate name already exists")
    gate = Gate(name=payload.name, is_active=payload.is_active)
    db.add(gate)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="gate",
        entity_id=str(gate.id),
        actor_user_id=actor.id,
        details={"name": gate.name},
    )
    return gate


@router.patch("/gates/{gate_id}", response_model=GateOut)
def update_gate(
    gate_id: uuid.UUID,
    payload: GateUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> Gate:
    gate = db.get(Gate, gate_id)
    if gate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gate not found")

    changed: list[str] = []
    if payload.name is not None and payload.name != gate.name:
        clash = db.scalar(select(Gate).where(Gate.name == payload.name, Gate.id != gate.id))
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Gate name already exists"
            )
        gate.name = payload.name
        changed.append("name")
    if payload.is_active is not None:
        gate.is_active = payload.is_active
        changed.append("is_active")
    db.flush()
    record_audit(
        db,
        action="update",
        entity_type="gate",
        entity_id=str(gate.id),
        actor_user_id=actor.id,
        details={"fields": changed},
    )
    return gate


@router.delete("/gates/{gate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gate(
    gate_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> Response:
    gate = db.get(Gate, gate_id)
    if gate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gate not found")
    record_audit(
        db,
        action="delete",
        entity_type="gate",
        entity_id=str(gate.id),
        actor_user_id=actor.id,
        details={"name": gate.name},
    )
    db.delete(gate)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Facilities ----------------------------------------------------------


@router.get("/facilities", response_model=list[FacilityOut])
def list_facilities(
    db: Session = Depends(get_db),
    _: User = Depends(_manage_roles),
) -> list[Facility]:
    return list(db.scalars(select(Facility).order_by(Facility.name)))


@router.post("/facilities", response_model=FacilityOut, status_code=status.HTTP_201_CREATED)
def create_facility(
    payload: FacilityCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> Facility:
    if db.scalar(select(Facility).where(Facility.name == payload.name)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Facility name already exists"
        )
    facility = Facility(name=payload.name, is_active=payload.is_active)
    db.add(facility)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="facility",
        entity_id=str(facility.id),
        actor_user_id=actor.id,
        details={"name": facility.name},
    )
    return facility


@router.patch("/facilities/{facility_id}", response_model=FacilityOut)
def update_facility(
    facility_id: uuid.UUID,
    payload: FacilityUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> Facility:
    facility = db.get(Facility, facility_id)
    if facility is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Facility not found")

    changed: list[str] = []
    if payload.name is not None and payload.name != facility.name:
        clash = db.scalar(
            select(Facility).where(Facility.name == payload.name, Facility.id != facility.id)
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Facility name already exists"
            )
        facility.name = payload.name
        changed.append("name")
    if payload.is_active is not None:
        facility.is_active = payload.is_active
        changed.append("is_active")
    db.flush()
    record_audit(
        db,
        action="update",
        entity_type="facility",
        entity_id=str(facility.id),
        actor_user_id=actor.id,
        details={"fields": changed},
    )
    return facility


@router.delete("/facilities/{facility_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_facility(
    facility_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> Response:
    facility = db.get(Facility, facility_id)
    if facility is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Facility not found")
    record_audit(
        db,
        action="delete",
        entity_type="facility",
        entity_id=str(facility.id),
        actor_user_id=actor.id,
        details={"name": facility.name},
    )
    db.delete(facility)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
