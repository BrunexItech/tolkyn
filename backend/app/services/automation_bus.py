"""Real-time automation trigger → action bus.

Call ``emit(db, workspace_id, trigger, context)`` from wherever a real event
actually happens (a lead is captured, a social message arrives, a post goes
live). Every enabled automation on that trigger whose ``trigger_config``
matches the context runs its action for real, and an ``AutomationRun`` is
logged either way — ok, skipped (rule didn't apply / nothing to act on), or
error. Rules with no matching trigger are simply not queried, so this is
cheap to call from a hot path.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import Automation, AutomationAction, AutomationTrigger, AutomationRun
from app.models.inbox import InboxThread
from app.models.lead import Lead

_SCORE_RANK = {"hot": 3, "warm": 2, "cold": 1, "unknown": 0}
_CADENCE = {
    "hourly": timedelta(hours=1),
    "daily": timedelta(days=1),
    "weekly": timedelta(days=7),
}
_THREAD_TRIGGERS = {
    AutomationTrigger.NEW_COMMENT,
    AutomationTrigger.NEW_MENTION,
    AutomationTrigger.INBOUND_MESSAGE,
}


class _Skip(Exception):
    """A clean 'nothing to do' outcome — logged as skipped, not an error."""


def _trigger_matches(a: Automation, context: Dict[str, Any]) -> str | None:
    """Returns a skip reason if the rule's trigger_config filters it out, else None."""
    cfg = a.trigger_config or {}
    if a.trigger == AutomationTrigger.NEW_LEAD:
        min_score = (cfg.get("min_score") or "").lower()
        if min_score:
            have = _SCORE_RANK.get((context.get("score") or "unknown").lower(), 0)
            need = _SCORE_RANK.get(min_score, 0)
            if have < need:
                return f"Lead score below the '{min_score}' threshold"
    elif a.trigger in _THREAD_TRIGGERS:
        platform = (cfg.get("platform") or "").lower()
        if platform and platform != (context.get("platform") or "").lower():
            return f"Not on {platform}"
        keyword = (cfg.get("keyword") or "").strip().lower()
        if keyword and keyword not in (context.get("message") or "").lower():
            return "Keyword not found in the message"
    elif a.trigger == AutomationTrigger.POST_PUBLISHED:
        platform = (cfg.get("platform") or "").lower()
        if platform and platform not in [p.lower() for p in (context.get("platforms") or [])]:
            return f"Not published on {platform}"
    elif a.trigger == AutomationTrigger.SCHEDULE:
        cadence = (cfg.get("cadence") or "daily").lower()
        interval = _CADENCE.get(cadence, timedelta(days=1))
        if a.last_run_at and (datetime.now(timezone.utc) - a.last_run_at) < interval:
            return "Not due yet"
    return None


async def emit(db: AsyncSession, workspace_id: str, trigger: str, context: Dict[str, Any]) -> int:
    """Fire every enabled automation on this trigger. Returns how many actually ran."""
    try:
        trig = AutomationTrigger(trigger)
    except ValueError:
        return 0

    rules = list(
        (
            await db.execute(
                select(Automation).where(
                    Automation.workspace_id == workspace_id,
                    Automation.trigger == trig,
                    Automation.enabled.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    if not rules:
        return 0

    ran = 0
    for a in rules:
        reason = _trigger_matches(a, context)
        if reason:
            await _log(db, a, "skipped", reason, context)
            continue
        try:
            summary = await _run_action(db, workspace_id, a, context)
            await _log(db, a, "ok", summary, context)
            ran += 1
        except _Skip as sk:
            await _log(db, a, "skipped", str(sk), context)
        except Exception as exc:  # noqa: BLE001 - one bad rule shouldn't break the event
            await _log(db, a, "error", str(exc)[:300], context)
    return ran


async def _log(db: AsyncSession, a: Automation, status: str, summary: str, context: Dict[str, Any]) -> None:
    safe_ctx = {k: v for k, v in context.items() if isinstance(v, (str, int, float, bool)) or v is None}
    run = AutomationRun(
        automation_id=a.id,
        workspace_id=a.workspace_id,
        status=status,
        summary=(summary or "")[:400],
        context=safe_ctx,
    )
    a.runs_count = (a.runs_count or 0) + 1
    a.last_run_at = datetime.now(timezone.utc)
    db.add(run)
    await db.commit()


async def _get_lead(db: AsyncSession, workspace_id: str, lead_id: str) -> Lead | None:
    return (
        await db.execute(select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace_id))
    ).scalar_one_or_none()


async def _run_action(db: AsyncSession, workspace_id: str, a: Automation, context: Dict[str, Any]) -> str:
    action = a.action
    cfg = a.action_config or {}

    if action == AutomationAction.NOTIFY:
        return f"Notified you — {context.get('label') or a.trigger.value.replace('_', ' ')}"

    if action == AutomationAction.ADD_TAG:
        tag = (cfg.get("tag") or "").strip()
        lead_id = context.get("lead_id")
        if not tag or not lead_id:
            raise _Skip("Needs a lead and a tag to add")
        lead = await _get_lead(db, workspace_id, lead_id)
        if not lead:
            raise _Skip("Lead not found")
        tags = list(lead.tags or [])
        if tag not in tags:
            tags.append(tag)
            lead.tags = tags
        return f"Tagged '{lead.name}' with '{tag}'"

    if action == AutomationAction.PUSH_TO_CRM:
        lead_id = context.get("lead_id")
        if not lead_id:
            raise _Skip("Needs a lead")
        lead = await _get_lead(db, workspace_id, lead_id)
        if not lead:
            raise _Skip("Lead not found")
        if lead.converted_customer_id:
            return "Already in the CRM"
        from app.schemas.customer import ConvertLeadRequest
        from app.services.customer_service import CustomerService

        customer = await CustomerService(db, workspace_id).create_from_lead(lead, ConvertLeadRequest())
        lead.converted_customer_id = customer.id
        lead.converted_at = datetime.now(timezone.utc)
        return f"Pushed '{lead.name}' to the CRM"

    if action == AutomationAction.ASSIGN_TEAMMATE:
        assignee = (cfg.get("assignee") or "").strip()
        if not assignee:
            raise _Skip("No teammate configured on this rule")
        lead_id = context.get("lead_id")
        thread_id = context.get("thread_id")
        if lead_id:
            lead = await _get_lead(db, workspace_id, lead_id)
            if lead:
                lead.assigned_to = assignee
                return f"Assigned '{lead.name}' to a teammate"
        if thread_id:
            thread = (
                await db.execute(
                    select(InboxThread).where(
                        InboxThread.id == thread_id, InboxThread.workspace_id == workspace_id
                    )
                )
            ).scalar_one_or_none()
            if thread:
                thread.assignee = assignee
                return "Assigned the conversation to a teammate"
        raise _Skip("Nothing to assign")

    if action == AutomationAction.SEND_SMS:
        from app.services.messaging_provider import normalize_phone, send_sms

        phone = context.get("phone")
        lead_id = context.get("lead_id")
        if not phone and lead_id:
            lead = await _get_lead(db, workspace_id, lead_id)
            phone = lead.phone if lead else None
        phone = normalize_phone(phone or "")
        if not phone:
            raise _Skip("No phone number to text")
        body = (cfg.get("template") or "Hi — thanks for reaching out, we'll be in touch shortly.")[:600]
        res = await send_sms(phone, body)
        if not res.ok:
            raise RuntimeError(res.error or "SMS failed")
        return f"Texted {phone}" + (" (test mode)" if res.simulated else "")

    if action == AutomationAction.SEND_EMAIL:
        lead_id = context.get("lead_id")
        if not lead_id:
            raise _Skip("Needs a lead with an email address")
        lead = await _get_lead(db, workspace_id, lead_id)
        if not lead or not lead.email:
            raise _Skip("No email address for this lead")

        from app.services.email_account_service import EmailAccountService
        from app.services.email_sender import send_email

        accounts = EmailAccountService(db, workspace_id)
        acc = await accounts.default_account()
        if not acc:
            raise _Skip("No default sending account configured in Settings")
        smtp_cfg = accounts.smtp_config(acc)
        subject = (cfg.get("subject") or f"Hi {lead.name}").strip()[:255]
        body = (cfg.get("template") or "Thanks for your interest — we'll follow up shortly.").strip()
        if acc.signature:
            body = f"{body}\n\n{acc.signature}"
        outcome = await send_email(smtp_cfg, lead.email, subject, body)
        await accounts.record_send(acc, outcome.ok, outcome.error)
        if not outcome.ok:
            raise RuntimeError(outcome.error or "Email failed")
        return f"Emailed {lead.email}"

    if action == AutomationAction.AUTO_REPLY:
        thread_id = context.get("thread_id")
        if not thread_id:
            raise _Skip("No conversation to reply to")
        from app.services.inbox_service import InboxService

        body = (cfg.get("template") or "Thanks for reaching out — we'll get back to you shortly.")[:2000]
        await InboxService(db, workspace_id).reply(thread_id, body, via="automation")
        return "Auto-replied"

    raise _Skip("Unrecognised action")
