"""'WhatsApp community' campaigns — every participant has a private 1:1 chat
with the business (see whatsapp_web_service), and a reply from any one of
them is relayed into every other participant's own private chat under a
pseudo-name. Nobody's real name or number is ever sent to another
participant — only the workspace's own Inbox/CRM sees real identities.
"""
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.campaign_group import CampaignGroup, CampaignGroupMessage, CampaignGroupParticipant
from app.services.messaging_provider import normalize_phone


class CampaignGroupService:
    def __init__(self, db: AsyncSession, workspace_id: str):
        self.db = db
        self.workspace_id = workspace_id

    async def list(self) -> List[CampaignGroup]:
        res = await self.db.execute(
            select(CampaignGroup)
            .options(selectinload(CampaignGroup.participants))
            .where(CampaignGroup.workspace_id == self.workspace_id)
            .order_by(CampaignGroup.created_at.desc())
        )
        return list(res.scalars().all())

    async def get(self, group_id: str) -> CampaignGroup:
        res = await self.db.execute(
            select(CampaignGroup)
            .options(selectinload(CampaignGroup.participants), selectinload(CampaignGroup.messages))
            .where(CampaignGroup.id == group_id, CampaignGroup.workspace_id == self.workspace_id)
        )
        group = res.scalar_one_or_none()
        if not group:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign group not found")
        return group

    async def create(
        self, name: str, recipients: List[Dict[str, Any]], owner_id: str, initial_message: str = ""
    ) -> Tuple[CampaignGroup, List[str]]:
        """Returns (group, send_errors) — creation still succeeds even if some
        recipients' opening message fails to send (bad number, etc.)."""
        group = CampaignGroup(name=name.strip(), owner_id=owner_id, workspace_id=self.workspace_id)
        self.db.add(group)
        await self.db.flush()

        participants: List[CampaignGroupParticipant] = []
        for i, r in enumerate(recipients, start=1):
            phone = normalize_phone(str(r.get("phone", "")))
            if not phone:
                continue
            p = CampaignGroupParticipant(
                group_id=group.id,
                phone=phone,
                real_name=(r.get("name") or "").strip() or None,
                pseudo_name=f"Participant {i}",
                workspace_id=self.workspace_id,
            )
            self.db.add(p)
            participants.append(p)

        if not participants:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No valid recipients")

        await self.db.commit()
        # `participants` was populated via db.add(), not group.participants.append(),
        # so the ORM relationship collection is still unloaded on `group` — an
        # implicit lazy-load here would hit MissingGreenlet under asyncio. Load it
        # explicitly so callers (e.g. the response model) can read it safely.
        await self.db.refresh(group, attribute_names=["participants"])

        errors: List[str] = []
        if initial_message.strip():
            errors = await self._broadcast(group, participants, initial_message.strip(), participant_id=None)

        return group, errors

    async def send_message(self, group_id: str, body: str) -> Tuple[CampaignGroup, List[str]]:
        """Admin speaking to the whole group — same fan-out as the opening
        message, logged the same way (participant_id=None)."""
        group = await self.get(group_id)
        errors = await self._broadcast(group, list(group.participants), body.strip(), participant_id=None)
        # This session is expire_on_commit=False, so `group` is NOT invalidated
        # by _broadcast's commit — a plain re-`get()` would hand back the same
        # identity-mapped object with its now-stale, already-loaded `messages`
        # collection (selectinload skips re-querying an already-populated
        # relationship). Force a real reload instead.
        await self.db.refresh(group, attribute_names=["messages"])
        return group, errors

    async def _send_to(self, recipients: List[CampaignGroupParticipant], text: str) -> List[str]:
        """Fire-and-log delivery to a set of participants — one bad number
        never blocks the rest of the fan-out."""
        from app.services.whatsapp_web_service import WhatsAppWebError, send_message

        errors: List[str] = []
        for p in recipients:
            try:
                await send_message(self.workspace_id, p.phone, text)
            except WhatsAppWebError as exc:
                errors.append(f"{p.pseudo_name}: {exc.message}")
        return errors

    async def _broadcast(
        self,
        group: CampaignGroup,
        recipients: List[CampaignGroupParticipant],
        body: str,
        *,
        participant_id: Optional[str],
    ) -> List[str]:
        """Sends `body` individually to each of `recipients` and logs one
        CampaignGroupMessage row for it. `participant_id` is who's speaking
        (None = the admin/business itself, e.g. the opening message)."""
        errors = await self._send_to(recipients, body)
        self.db.add(
            CampaignGroupMessage(
                group_id=group.id, participant_id=participant_id, body=body, workspace_id=self.workspace_id
            )
        )
        await self.db.commit()
        return errors

    async def relay_reply(self, phone: str, body: str) -> bool:
        """Called from the inbound WhatsApp webhook. Returns True if `phone`
        is a known participant in one or more of this workspace's campaign
        groups (meaning the reply was relayed) — the caller still logs it in
        the normal Inbox regardless, for full admin visibility."""
        res = await self.db.execute(
            select(CampaignGroupParticipant).where(
                CampaignGroupParticipant.workspace_id == self.workspace_id,
                CampaignGroupParticipant.phone == phone,
            )
        )
        participants = res.scalars().all()
        if not participants:
            return False

        for participant in participants:
            group = await self.get(participant.group_id)
            others = [p for p in group.participants if p.id != participant.id]
            # One clean record of the real message against the real speaker...
            self.db.add(
                CampaignGroupMessage(
                    group_id=group.id, participant_id=participant.id, body=body, workspace_id=self.workspace_id
                )
            )
            await self.db.commit()
            # ...but everyone else only ever receives it under the pseudonym.
            await self._send_to(others, f"{participant.pseudo_name}: {body}")
        return True
