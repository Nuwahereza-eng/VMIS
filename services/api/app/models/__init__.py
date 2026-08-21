"""Model package. Import all models so metadata is fully populated."""

from app.models.activity import Activity, ActivityRate
from app.models.audit import AuditEntry
from app.models.base import Base
from app.models.booking import Accommodation, VisitorActivity
from app.models.enums import Role, VisitorCategory
from app.models.user import User
from app.models.visit import Visit
from app.models.visitor import Visitor

__all__ = [
    "Base",
    "Role",
    "VisitorCategory",
    "User",
    "Visitor",
    "Visit",
    "Activity",
    "ActivityRate",
    "VisitorActivity",
    "Accommodation",
    "AuditEntry",
]
