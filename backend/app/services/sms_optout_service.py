"""SMS opt-out (STOP-reply) handling.

The disclaimer every workspace can add to its Bulk SMS ("Reply STOP to
opt out") used to be just text -- nothing on the backend ever acted on an
inbound STOP. This makes it real: an inbound-SMS webhook (see
api/v1/endpoints/messaging.py) calls record_stop_reply() when a reply
matches an opt-out keyword, and MessagingService.send() calls
suppress_opted_out() before every broadcast so a suppressed number never
receives another message.
"""
from __future__ import annotations

import logging
import re
from typing import List, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sms_optout import SmsOptOut
from app.services.messaging_provider import normalize_phone

logger = logging.getLogger(__name__)

# Matches if the ENTIRE message is (essentially) just the keyword -- not a
# substring search, so "please end this offer" doesn't get misread as an
# opt-out. Mirrors the standard US/Kenya SMS carrier opt-out word list.
_STOP_KEYWORDS = {"stop", "unsubscribe", "cancel", "end", "quit", "optout", "opt out"}


def detect_stop_keyword(text: str) -> Optional[str]:
    cleaned = re.sub(r"[^\w\s]", "", (text or "").strip().lower())
    return cleaned if cleaned in _STOP_KEYWORDS else None


async def record_stop_reply(
    db: AsyncSession, phone: str, keyword: str, workspace_id: Optional[str] = None
) -> None:
    """workspace_id=None means the reply came in on the platform's shared
    sender -- see SmsOptOut's own docstring for why that has to apply
    platform-wide rather than to one tenant."""
    e164 = normalize_phone(phone) or phone
    existing = (
        await db.execute(
            select(SmsOptOut.id).where(
                SmsOptOut.workspace_id == workspace_id, SmsOptOut.phone == e164
            )
        )
    ).scalar_one_or_none()
    if existing:
        return
    db.add(SmsOptOut(workspace_id=workspace_id, phone=e164, keyword=keyword))
    await db.commit()
    logger.info("SMS opt-out recorded: %s (workspace=%s, keyword=%r)", e164, workspace_id, keyword)


async def suppress_opted_out(db: AsyncSession, workspace_id: str, phones: List[str]) -> List[str]:
    """Returns `phones` with any opted-out number removed -- checks both a
    platform-wide (shared-sender) opt-out and one specific to this
    workspace's own sender, since either can apply."""
    if not phones:
        return phones
    normalized = {p: (normalize_phone(p) or p) for p in phones}
    rows = await db.execute(
        select(SmsOptOut.phone).where(
            SmsOptOut.phone.in_(normalized.values()),
            or_(SmsOptOut.workspace_id.is_(None), SmsOptOut.workspace_id == workspace_id),
        )
    )
    opted_out = {r[0] for r in rows.all()}
    if not opted_out:
        return phones
    return [p for p in phones if normalized[p] not in opted_out]
