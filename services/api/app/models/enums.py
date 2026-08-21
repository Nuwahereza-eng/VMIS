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


# Currency each category is billed in (build prompt Table 1). The three foreign
# categories pay in USD; East African Citizens pay in UGX.
CATEGORY_CURRENCY: dict[VisitorCategory, str] = {
    VisitorCategory.FNR: "USD",
    VisitorCategory.FR: "USD",
    VisitorCategory.ROA: "USD",
    VisitorCategory.EAC: "UGX",
}

# ISO 4217 minor-unit exponent per currency. USD has 2 (cents); UGX has 0.
# Amounts are always stored as integer minor units (build prompt section 2).
CURRENCY_MINOR_EXPONENT: dict[str, int] = {
    "USD": 2,
    "UGX": 0,
}
