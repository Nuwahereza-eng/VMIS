"""Outbound email delivery behind a small, swappable backend.

The rest of the app builds an :class:`OutgoingEmail` and calls
:func:`send_email`; which provider carries it is configuration
(``VMIS_EMAIL_BACKEND``). Supported backends:

- ``none``    email is off: :class:`EmailNotConfigured` is raised
- ``console`` the message is logged, not sent (local development)
- ``smtp``    any SMTP provider; port 465 uses implicit TLS, others STARTTLS
- ``resend``  Resend's HTTPS API, for hosts that block outbound SMTP ports
- ``memory``  kept in :data:`OUTBOX` (tests)

Only the standard library is used, so no new dependency is pulled in.
"""

import base64
import json
import logging
import smtplib
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from email.message import EmailMessage

from app.config import get_settings

log = logging.getLogger("vmis.mailer")

_TIMEOUT_SECONDS = 20

# Messages captured by the "memory" backend, newest last (tests only).
OUTBOX: list["OutgoingEmail"] = []


@dataclass(frozen=True)
class InlineImage:
    """An image shown in the HTML body via ``cid:<content_id>``, also attached
    as a file so clients that strip inline images still deliver it."""

    content_id: str
    filename: str
    data: bytes
    subtype: str = "png"


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    text: str
    html: str
    images: list[InlineImage] = field(default_factory=list)


class EmailNotConfigured(RuntimeError):
    """Email delivery is switched off or missing settings on this server."""


class EmailSendFailed(RuntimeError):
    """The provider refused or could not be reached."""


def email_enabled() -> bool:
    return get_settings().email_backend.strip().lower() not in ("", "none")


def send_email(message: OutgoingEmail) -> None:
    settings = get_settings()
    backend = settings.email_backend.strip().lower()

    if backend in ("", "none"):
        raise EmailNotConfigured("Email delivery is not set up on this server")
    if backend == "memory":
        OUTBOX.append(message)
        return
    if backend == "console":
        log.warning(
            "EMAIL (console backend, not sent) to=%s subject=%r images=%d\n%s",
            message.to,
            message.subject,
            len(message.images),
            message.text,
        )
        return
    if not settings.email_from:
        raise EmailNotConfigured("VMIS_EMAIL_FROM is not set")
    if backend == "smtp":
        _send_smtp(message, settings)
        return
    if backend == "resend":
        _send_resend(message, settings)
        return
    raise EmailNotConfigured(f"Unknown email backend {backend!r}")


def _build_mime(message: OutgoingEmail, sender: str) -> EmailMessage:
    mime = EmailMessage()
    mime["From"] = sender
    mime["To"] = message.to
    mime["Subject"] = message.subject
    mime.set_content(message.text)
    mime.add_alternative(message.html, subtype="html")
    html_part = mime.get_payload()[-1]
    for image in message.images:
        html_part.add_related(
            image.data,
            maintype="image",
            subtype=image.subtype,
            cid=f"<{image.content_id}>",
            filename=image.filename,
        )
    return mime


def _send_smtp(message: OutgoingEmail, settings) -> None:
    if not settings.smtp_host:
        raise EmailNotConfigured("VMIS_SMTP_HOST is not set")
    mime = _build_mime(message, settings.email_from)
    context = ssl.create_default_context()
    try:
        if settings.smtp_port == 465:
            server = smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=_TIMEOUT_SECONDS, context=context
            )
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=_TIMEOUT_SECONDS)
        with server:
            if settings.smtp_port != 465:
                server.starttls(context=context)
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password or "")
            server.send_message(mime)
    except (smtplib.SMTPException, OSError) as exc:
        log.exception("SMTP send to %s failed", message.to)
        raise EmailSendFailed(f"The mail server could not send the email ({exc.__class__.__name__})") from exc


def _send_resend(message: OutgoingEmail, settings) -> None:
    if not settings.resend_api_key:
        raise EmailNotConfigured("VMIS_RESEND_API_KEY is not set")
    payload = {
        "from": settings.email_from,
        "to": [message.to],
        "subject": message.subject,
        "text": message.text,
        "html": message.html,
        "attachments": [
            {
                "filename": image.filename,
                "content": base64.b64encode(image.data).decode("ascii"),
                "content_id": image.content_id,
            }
            for image in message.images
        ],
    }
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        log.error("Resend refused email to %s: %s %s", message.to, exc.code, detail)
        raise EmailSendFailed(f"The email provider refused the message ({exc.code})") from exc
    except (urllib.error.URLError, OSError) as exc:
        log.exception("Resend request for %s failed", message.to)
        raise EmailSendFailed("Could not reach the email provider") from exc
