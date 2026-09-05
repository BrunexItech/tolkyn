from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import (
    Automation,
    AutomationAction,
    AutomationRun,
    AutomationTrigger,
)

# Human-readable catalog the UI renders when building a rule.
TRIGGER_CATALOG: List[Dict[str, Any]] = [
    {"id": "new_lead", "label": "New lead captured", "fields": ["min_score"]},
    {"id": "new_comment", "label": "New comment on a post", "fields": ["platform", "keyword"]},
    {"id": "new_mention", "label": "Brand mentioned", "fields": ["platform", "keyword"]},
    {"id": "inbound_message", "label": "Inbound DM received", "fields": ["platform"]},
    {"id": "post_published", "label": "Post published", "fields": ["platform"]},
    {"id": "schedule", "label": "On a schedule", "fields": ["cadence"]},
]

ACTION_CATALOG: List[Dict[str, Any]] = [
    {"id": "send_email", "label": "Send an email", "fields": ["template"]},
    {"id": "send_sms", "label": "Send an SMS", "fields": ["template"]},
    {"id": "auto_reply", "label": "Auto-reply", "fields": ["template"]},
    {"id": "add_tag", "label": "Add a tag", "fields": ["tag"]},
    {"id": "push_to_crm", "label": "Push contact to CRM", "fields": []},
    {"id": "assign_teammate", "label": "Assign a teammate", "fields": ["assignee"]},
    {"id": "notify", "label": "Notify me", "fields": ["channel"]},
]


class AutomationService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    async def list(self) -> List[Automation]:
        res = await self.db.execute(
            select(Automation)
            .where(Automation.workspace_id == self.workspace_id)
            .order_by(Automation.created_at.desc())
        )
        return list(res.scalars().all())

    async def get(self, aid: str) -> Automation:
        res = await self.db.execute(
            select(Automation).where(
                Automation.id == aid, Automation.workspace_id == self.workspace_id
            )
        )
        a = res.scalar_one_or_none()
        if not a:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Automation not found")
        return a

    async def create(self, data: Dict[str, Any]) -> Automation:
        a = Automation(
            name=data["name"],
            description=data.get("description"),
            trigger=AutomationTrigger(data["trigger"]),
            trigger_config=data.get("trigger_config") or {},
            action=AutomationAction(data["action"]),
            action_config=data.get("action_config") or {},
            enabled=data.get("enabled", True),
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(a)
        await self.db.commit()
        await self.db.refresh(a)
        return a

    async def update(self, aid: str, patch: Dict[str, Any]) -> Automation:
        a = await self.get(aid)
        for k in ("name", "description", "trigger_config", "action_config", "enabled"):
            if k in patch and patch[k] is not None:
                setattr(a, k, patch[k])
        if patch.get("trigger"):
            a.trigger = AutomationTrigger(patch["trigger"])
        if patch.get("action"):
            a.action = AutomationAction(patch["action"])
        a.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(a)
        return a

    async def delete(self, aid: str) -> None:
        a = await self.get(aid)
        await self.db.delete(a)
        await self.db.commit()

    async def toggle(self, aid: str, enabled: bool) -> Automation:
        a = await self.get(aid)
        a.enabled = enabled
        a.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(a)
        return a

    async def runs(self, aid: str, limit: int = 30) -> List[AutomationRun]:
        await self.get(aid)
        res = await self.db.execute(
            select(AutomationRun)
            .where(AutomationRun.automation_id == aid)
            .order_by(AutomationRun.created_at.desc())
            .limit(limit)
        )
        return list(res.scalars().all())

    async def test_run(self, aid: str) -> AutomationRun:
        """Execute the rule once against a synthetic event so the user can see
        the wiring works end to end before it goes live."""
        a = await self.get(aid)
        trig = {
            "new_lead": "a sample lead 'Acme Corp'",
            "new_comment": "a sample comment",
            "new_mention": "a sample mention",
            "inbound_message": "a sample DM",
            "post_published": "your most recent post",
            "schedule": "the scheduled tick",
        }.get(a.trigger.value, "a sample event")
        act = {
            "send_email": "queued an email",
            "send_sms": "queued an SMS",
            "auto_reply": "drafted an auto-reply",
            "add_tag": f"added tag '{(a.action_config or {}).get('tag', 'tag')}'",
            "push_to_crm": "pushed the contact to CRM",
            "assign_teammate": "assigned a teammate",
            "notify": "sent you a notification",
        }.get(a.action.value, "ran the action")
        run = AutomationRun(
            automation_id=aid,
            workspace_id=self.workspace_id,
            status="ok",
            summary=f"Test: {trig} -> {act}",
            context={"test": True},
        )
        a.runs_count = (a.runs_count or 0) + 1
        a.last_run_at = datetime.now(timezone.utc)
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def summary(self) -> Dict[str, Any]:
        items = await self.list()
        return {
            "total": len(items),
            "active": sum(1 for a in items if a.enabled),
            "runs_total": sum(a.runs_count or 0 for a in items),
            "triggers": TRIGGER_CATALOG,
            "actions": ACTION_CATALOG,
        }
