"""Bounce detection for inbound "Mail Delivery Subsystem"-style replies.

A mailbox provider's own bounce message is picked out heuristically from
its sender/subject (every major provider uses some variant of "Mail
Delivery Subsystem", "postmaster@", "Delivery Status Notification", etc.),
then the actual failed recipient is identified by cross-referencing every
email address mentioned in the bounce body against addresses this
workspace has genuinely sent to -- far more robust than parsing any one
provider's specific bounce wording (these vary a lot), since the failed
address is always present somewhere in the text regardless of phrasing.

Once identified, it's recorded in EmailBounce, and MessagingService's
sibling for email (email_campaign_service.resolve_recipients /
outreach_send_service) skips it on every future send -- same design
already proven for SMS STOP replies, see sms_optout_service.py.
"""
from __future__ import annotations

import logging
import re
from typing import Iterable, Optional, Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_bounce import EmailBounce
from app.models.email_send import EmailSend

logger = logging.getLogger(__name__)

_BOUNCE_SENDER_HINTS = ("mailer-daemon", "postmaster", "mail delivery subsystem", "mail delivery system")
_BOUNCE_SUBJECT_HINTS = (
    "delivery status notification", "undelivered mail", "undeliverable",
    "returned mail", "delivery has failed", "delivery failed", "mail delivery failed",
    "failure notice",
)
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")


def looks_like_bounce(from_email: str, from_name: Optional[str], subject: Optional[str]) -> bool:
    hay = f"{from_email} {from_name or ''} {subject or ''}".lower()
    return any(h in hay for h in _BOUNCE_SENDER_HINTS) or any(h in hay for h in _BOUNCE_SUBJECT_HINTS)


def extract_bounced_address(body_text: str, known_sent_addresses: Set[str]) -> Optional[str]:
    found = {m.lower() for m in _EMAIL_RE.findall(body_text or "")}
    matches = found & known_sent_addresses
    # Exactly one match is the confident case. 0 means we can't identify it
    # (don't guess); >1 means the bounce body mentions several addresses we
    # sent to (e.g. a digest of multiple failures) and we won't pick one
    # arbitrarily -- safer to skip than mis-flag the wrong contact's address.
    if len(matches) == 1:
        return matches.pop()
    return None


async def sent_addresses(db: AsyncSession, workspace_id: str) -> Set[str]:
    rows = await db.execute(
        select(EmailSend.to_email).where(EmailSend.workspace_id == workspace_id).distinct()
    )
    return {r[0].lower() for r in rows.all() if r[0]}


async def record_bounce(db: AsyncSession, workspace_id: str, email: str) -> None:
    email = email.strip().lower()
    existing = (
        await db.execute(
            select(EmailBounce.id).where(EmailBounce.workspace_id == workspace_id, EmailBounce.email == email)
        )
    ).scalar_one_or_none()
    if existing:
        return
    db.add(EmailBounce(workspace_id=workspace_id, email=email))
    logger.info("email bounce recorded: %s (workspace=%s)", email, workspace_id)


async def bounced_set(db: AsyncSession, workspace_id: str, emails: Iterable[str]) -> Set[str]:
    """Of `emails`, the subset already known to have bounced for this
    workspace -- callers filter their own recipient list with this."""
    candidates = {e.strip().lower() for e in emails if e}
    if not candidates:
        return set()
    rows = await db.execute(
        select(EmailBounce.email).where(
            EmailBounce.workspace_id == workspace_id, EmailBounce.email.in_(candidates)
        )
    )
    return {r[0] for r in rows.all()}
