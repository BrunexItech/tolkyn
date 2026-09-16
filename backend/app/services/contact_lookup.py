"""Resolve a phone number to a saved contact's name for this workspace.

The PBX never gives us a real caller-ID name (Kenyan mobile networks don't
send CNAM over SIP — just the digits), so "Unknown caller" was the only
option before. Most calls are to/from someone already in the workspace's own
CRM, phone book, or leads — check those instead of leaving it blank.

Numbers are compared on their last 9 digits so 0722..., 254722..., and
+254722... all match each other regardless of which format was saved.
"""
from __future__ import annotations

import re
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.lead import Lead
from app.models.phone_book import PhoneBookContact

_MODELS = (Customer, PhoneBookContact, Lead)


async def resolve_contact_name(db: AsyncSession, workspace_id: str, number: str) -> Optional[str]:
    digits = re.sub(r"\D", "", number or "")
    if len(digits) < 7:
        return None
    tail = digits[-9:]

    for model in _MODELS:
        name = (
            await db.execute(
                select(model.name)
                .where(
                    model.workspace_id == workspace_id,
                    model.phone.isnot(None),
                    func.regexp_replace(model.phone, r"\D", "", "g").like(f"%{tail}"),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if name:
            return name
    return None
