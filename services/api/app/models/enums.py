"""Enumerations shared across models and the RBAC layer."""

import enum


class Role(str, enum.Enum):
    """Access roles (build prompt section 6)."""

    GATE_OFFICER = "gate_officer"
    ACTIVITY_OFFICER = "activity_officer"
    MANAGEMENT = "management"


class VisitorCategory(str, enum.Enum):
    """Visitor fee categories (build prompt Table 1 / section 4.1)."""

    FNR = "FNR"  # Foreign Non-Resident (USD)
    FR = "FR"  # Foreign Resident (USD)
    ROA = "ROA"  # Rest of Africa (USD)
    EAC = "EAC"  # East African Citizen (UGX)
