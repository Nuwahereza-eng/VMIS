"""The emailed copy of a booking's digital ticket.

Bookings captured at a gate belong to visitors with no account, so the app's
"My visit" screen is out of reach for them. Once such a booking is paid, the
ticket goes to the email on the booking instead: the QR (encoding only the
ticket code, the same payload the app shows) plus the trip and payment details.
"""

import html
import io

import segno

from app.mailer import InlineImage, OutgoingEmail
from app.models.base import ensure_utc
from app.models.booking_request import Booking
from app.models.visit import Visit
from app.models.visitor import Visitor
from app.qr import build_qr_payload
from app.tickets import compute_validity

PARK_NAME = "Murchison Falls National Park"

_CATEGORY_LABEL = {
    "FNR": "Foreign Non-Resident",
    "FR": "Foreign Resident",
    "ROA": "Rest of Africa",
    "EAC": "East African Citizen",
}
# Minor-unit exponent per currency (USD cents; UGX has no minor unit).
_MINOR_EXPONENT = {"UGX": 0}


def format_money(amount_minor: int | None, currency: str | None) -> str:
    if amount_minor is None or not currency:
        return "—"
    exp = _MINOR_EXPONENT.get(currency, 2)
    major = amount_minor / 10**exp
    return f"{major:,.{exp}f} {currency}"


def ticket_qr_png(ticket_code: str) -> bytes:
    buffer = io.BytesIO()
    segno.make(ticket_code, error="m").save(buffer, kind="png", scale=8, border=2)
    return buffer.getvalue()


def _compose(
    *,
    to: str,
    code: str,
    qr_payload: str,
    subtitle: str,
    rows: list[tuple[str, str]],
    steps: list[str],
) -> OutgoingEmail:
    """Shared layout for every emailed ticket: header, QR, code, details table
    and what-to-do steps. ``qr_payload`` is exactly what the gate scanner reads."""
    text_lines = [
        f"Your {PARK_NAME} ticket",
        "",
        f"Ticket code: {code}",
        *[f"{label}: {value}" for label, value in rows],
        "",
        *[f"- {step}" for step in steps],
        "",
        "The QR code is attached to this email.",
    ]

    esc = html.escape
    row_html = "".join(
        f'<tr><td style="padding:6px 0;color:#7c8a83">{esc(label)}</td>'
        f'<td style="padding:6px 0;text-align:right;color:#16231d;font-weight:600">{esc(value)}</td></tr>'
        for label, value in rows
    )
    step_html = "".join(f'<li style="margin:0 0 6px">{esc(step)}</li>' for step in steps)
    body = f"""<!doctype html>
<html><body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#48564f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden">
        <tr><td style="background:#15633f;color:#ffffff;padding:20px 24px">
          <div style="font-size:18px;font-weight:700">{esc(PARK_NAME)}</div>
          <div style="font-size:13px;opacity:.85">{esc(subtitle)}</div>
        </td></tr>
        <tr><td align="center" style="padding:24px 24px 8px">
          <img src="cid:ticket-qr" width="220" height="220" alt="QR code for ticket {esc(code)}" style="display:block;border:0">
          <div style="margin-top:12px;font-family:Menlo,Consolas,monospace;font-size:20px;font-weight:700;letter-spacing:2px;color:#16231d">{esc(code)}</div>
          <div style="font-size:13px;color:#7c8a83">Show this QR at the gate</div>
        </td></tr>
        <tr><td style="padding:8px 24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e5eae7">{row_html}</table>
        </td></tr>
        <tr><td style="padding:8px 24px 24px;font-size:14px">
          <div style="font-weight:700;color:#15633f;margin:8px 0">At the park</div>
          <ul style="padding-left:18px;margin:0">{step_html}</ul>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""

    return OutgoingEmail(
        to=to,
        subject=f"Your {PARK_NAME} ticket {code}",
        text="\n".join(text_lines),
        html=body,
        images=[InlineImage(content_id="ticket-qr", filename=f"{code}.png", data=ticket_qr_png(qr_payload))],
    )


def build_ticket_email(booking: Booking) -> OutgoingEmail:
    """A paid booking's ticket. Caller guarantees the booking is paid and has
    both an email and a ticket code."""
    nights = booking.length_of_stay_nights
    category = _CATEGORY_LABEL.get(booking.category.value if booking.category else "", "—")
    rows = [
        ("Visitor", booking.full_name),
        ("Visit date", booking.intended_date.strftime("%a %d %b %Y")),
        ("Party size", str(booking.party_size)),
        ("Entry gate", booking.expected_gate or "Any park gate"),
        ("Stay", f"{nights} night{'' if nights == 1 else 's'}"),
        ("Category", category),
        ("Amount paid", format_money(booking.amount_minor, booking.currency)),
        ("Payment reference", booking.payment_reference or "—"),
    ]
    steps = [
        "Show this QR code at the entry gate. The officer scans it to check you in.",
        "Keep it on your phone (or printed): it is scanned again at checkpoints and when you exit.",
        f"Your ticket is valid for {nights * 24} hours from the moment it is scanned at the entry gate.",
    ]
    return _compose(
        to=booking.email,
        code=booking.ticket_code,
        qr_payload=booking.ticket_code,
        subtitle="Entry ticket · Paid",
        rows=rows,
        steps=steps,
    )


def build_visitor_ticket_email(visitor: Visitor, visit: Visit | None) -> OutgoingEmail:
    """A visitor registered at a gate: their visitor QR (the same payload the
    app shows on their profile) plus the current entry's validity."""
    code = visitor_code(visitor.id)
    category = _CATEGORY_LABEL.get(visitor.category.value if visitor.category else "", "—")
    rows = [
        ("Visitor", visitor.full_name),
        ("Category", category),
        ("Party size", str(visitor.num_visitors or 1)),
    ]
    steps = [
        "Keep this QR on your phone (or printed): it is scanned at checkpoints and when you exit.",
    ]
    if visit is not None:
        validity = compute_validity(visit.entry_timestamp, visit.nights_purchased)
        nights = visit.nights_purchased
        rows += [
            ("Ticket number", visit.ticket_number),
            ("Entry gate", visit.entry_gate),
            ("Entered", ensure_utc(visit.entry_timestamp).strftime("%a %d %b %Y, %H:%M UTC")),
            ("Stay", f"{nights} night{'' if nights == 1 else 's'}"),
            ("Valid until", validity.expiry.strftime("%a %d %b %Y, %H:%M UTC")),
        ]
        steps.append("Leave the park, or extend your stay with a gate officer, before the ticket expires.")
    return _compose(
        to=visitor.email,
        code=code,
        qr_payload=build_qr_payload(visitor.id),
        subtitle="Visitor ticket",
        rows=rows,
        steps=steps,
    )


def visitor_code(visitor_id) -> str:
    """The short code shown with a visitor QR, e.g. ``VM-1A2B3C4D`` (mirrors
    the web app's visitorCode)."""
    return "VM-" + visitor_id.hex[:8].upper()
