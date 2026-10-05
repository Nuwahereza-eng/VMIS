"""Enumerations shared across models and the RBAC layer."""

import enum


class Role(str, enum.Enum):
    """Access roles (build prompt section 6)."""

    GATE_OFFICER = "gate_officer"
    ACTIVITY_OFFICER = "activity_officer"
    MANAGEMENT = "management"
    # Self-service public visitor: explores park info freely, then creates an
    # account to make and manage their own pre-bookings. Never granted any
    # officer/management capability (enforced server-side in /auth/register).
    TOURIST = "tourist"


class VisitorCategory(str, enum.Enum):
    """Visitor fee categories (build prompt Table 1 / section 4.1)."""

    FNR = "FNR"  # Foreign Non-Resident (USD)
    FR = "FR"  # Foreign Resident (USD)
    ROA = "ROA"  # Rest of Africa (USD)
    EAC = "EAC"  # East African Citizen (UGX)


class ScanKind(str, enum.Enum):
    """Where in the visit journey a QR scan happened (supervisor priority 3)."""

    ENTRANCE = "entrance"  # scanned at a park entry gate
    CHECKPOINT = "checkpoint"  # scanned at an internal checkpoint
    EXIT = "exit"  # scanned when leaving the park


class VisitorStatus(str, enum.Enum):
    """Derived lifecycle status of a visitor (supervisor priority 3).

    Never stored: computed from the latest visit, ticket validity, and scan
    trail. ``BOOKED``/``EXPECTED``/``ARRIVED`` become reachable once the
    pre-booking module lands; the rest are derivable today.
    """

    NO_TICKET = "No ticket"
    BOOKED = "Booked"
    EXPECTED = "Expected"
    ARRIVED = "Arrived"
    INSIDE = "Inside the park"
    AT_CHECKPOINT = "At a checkpoint"
    EXITED = "Exited"
    EXPIRED = "Ticket expired"


class BookingStatus(str, enum.Enum):
    """Lifecycle of a pre-booking / expression of interest (supervisor priority 2)."""

    PENDING = "pending"  # captured, visitor expected but not yet arrived
    ARRIVED = "arrived"  # linked to a registered visitor on arrival
    CANCELLED = "cancelled"  # withdrawn before arrival
    NO_SHOW = "no_show"  # intended date passed with no arrival


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
