"""Platform (Tolkyn-brand) transactional & announcement email.

Uses the platform SMTP identity from settings (SMTP_* — tolkynkenya@gmail.com
in production). Distinct from tenants' own `EmailAccount` sending identities.

Swappable later: point `_provider()` at an ESP (SES / SendGrid / Mailgun) and
nothing else changes.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Iterable, List, Optional, Sequence, Tuple

from app.core.config import settings
from app.core.email_templates import render_email
from app.services.email_sender import SendOutcome, SmtpConfig, send_email

logger = logging.getLogger("tolkyn.mailer")

# Gmail free ≈ 500 recipients/day, Workspace ≈ 2000. Space out bulk sends so a
# burst doesn't trip spam heuristics.
_BULK_GAP_SECONDS = 1.2


def is_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def _cfg() -> SmtpConfig:
    return SmtpConfig(
        host=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or settings.SMTP_FROM_EMAIL,
        password=settings.SMTP_PASSWORD or "",
        use_tls=settings.SMTP_PORT == 587,
        use_ssl=settings.SMTP_PORT == 465,
        from_name=settings.SMTP_FROM_NAME,
        from_email=settings.SMTP_FROM_EMAIL,
    )


async def send_branded(
    to_email: str,
    subject: str,
    *,
    heading: str,
    body_lines: List[str],
    button_label: Optional[str] = None,
    button_url: Optional[str] = None,
    footnote: Optional[str] = None,
    preheader: Optional[str] = None,
) -> SendOutcome:
    """Render + send one Tolkyn-branded email."""
    if not is_configured():
        logger.warning("platform_mailer not configured — skipping email to %s (%s)", to_email, subject)
        return SendOutcome(ok=False, error="Platform email is not configured")

    html, text = render_email(
        heading=heading,
        body_lines=body_lines,
        button_label=button_label,
        button_url=button_url,
        footnote=footnote,
        preheader=preheader or subject,
    )
    outcome = await send_email(_cfg(), to_email, subject, text, html=html)
    if not outcome.ok:
        logger.error("platform email to %s failed: %s", to_email, outcome.error)
    return outcome


async def send_raw(to_email: str, subject: str, text_body: str, html_body: Optional[str] = None) -> SendOutcome:
    if not is_configured():
        return SendOutcome(ok=False, error="Platform email is not configured")
    return await send_email(_cfg(), to_email, subject, text_body, html=html_body)


async def send_bulk_branded(
    recipients: Sequence[Tuple[str, dict]],
    subject: str,
    *,
    heading: str,
    body_template: str,
    button_label: Optional[str] = None,
    button_url: Optional[str] = None,
) -> dict:
    """Send the same branded email to many recipients, one connection per send,
    paced by `_BULK_GAP_SECONDS`. `recipients` = [(email, vars), ...] where
    `body_template` may use {name} / {vars…}. Returns aggregate counts only."""
    sent = failed = 0
    errors: List[str] = []
    for email, vars_ in recipients:
        try:
            body = body_template.format(**{"name": vars_.get("name", "there"), **vars_})
        except (KeyError, IndexError, ValueError):
            body = body_template
        outcome = await send_branded(
            email,
            subject,
            heading=heading,
            body_lines=[line for line in body.split("\n")],
            button_label=button_label,
            button_url=button_url,
        )
        if outcome.ok:
            sent += 1
        else:
            failed += 1
            if outcome.error and outcome.error not in errors:
                errors.append(outcome.error)
        await asyncio.sleep(_BULK_GAP_SECONDS)
    return {"sent": sent, "failed": failed, "total": len(recipients), "errors": errors[:5]}
