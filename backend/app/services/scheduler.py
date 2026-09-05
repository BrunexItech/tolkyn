"""In-process background scheduler.

Runs inside the API server (no separate worker process / cron needed).
Every ``SCHEDULER_INTERVAL_SECONDS`` it finds every workspace with a post
due to publish and runs that workspace's ``PostService.run_due()`` — the
same logic the Calendar's "Publish due" button already calls, just on a
timer instead of a click.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.core import scheduler_lock
from app.core.actor import Actor
from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.models.automation import Automation, AutomationTrigger
from app.models.post import Post, PostStatus
from app.models.team_member import TeamRole
from app.services.automation_bus import emit as emit_automation
from app.services.post_service import PostService
from app.services.social_lead_service import SocialLeadService
from app.services.video_service import advance_pending_jobs

_task: "asyncio.Task | None" = None


def _owner_actor(workspace_id: str) -> Actor:
    """A background sweep has no logged-in caller to resolve an Actor from —
    it acts as the workspace owner by construction, exactly as PostService's
    own run_due() always has (this only changed shape, not meaning, when
    PostService moved from a bare user_id to an Actor)."""
    return Actor(user_id=workspace_id, workspace_id=workspace_id, role=TeamRole.OWNER, permissions=["*"])


async def _due_workspace_ids(db) -> list[str]:
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(Post.workspace_id)
        .where(
            Post.status == PostStatus.SCHEDULED,
            Post.scheduled_at.isnot(None),
            Post.scheduled_at <= now,
        )
        .distinct()
    )
    return [row[0] for row in res.all()]


async def run_due_posts_once() -> int:
    """One sweep across every workspace. Returns how many posts were published."""
    published = 0
    async with AsyncSessionLocal() as db:
        try:
            workspace_ids = await _due_workspace_ids(db)
        except Exception as exc:  # pragma: no cover - best effort
            print(f"[scheduler] failed to list due workspaces: {exc}")
            return 0

    for wid in workspace_ids:
        async with AsyncSessionLocal() as db:
            try:
                published += await PostService(db, _owner_actor(wid)).run_due()
            except Exception as exc:  # pragma: no cover - one bad workspace shouldn't kill the sweep
                print(f"[scheduler] run_due failed for workspace {wid}: {exc}")

    await _run_scheduled_automations()
    await _advance_video_jobs()
    await _scan_social_leads_once()
    return published


async def _scan_social_leads_once() -> None:
    """Every workspace with any inbox activity gets a debounced comment/DM
    classification pass each sweep, so a lead surfaces in the CRM on its own
    instead of only when someone happens to open CRM > Social Leads.
    SocialLeadService.scan()'s own in-memory TTL keeps repeat sweeps cheap."""
    from app.models.inbox import InboxThread

    async with AsyncSessionLocal() as db:
        try:
            workspace_ids = (
                (await db.execute(select(InboxThread.workspace_id).distinct())).scalars().all()
            )
        except Exception as exc:  # pragma: no cover - best effort
            print(f"[scheduler] failed to list inbox workspaces: {exc}")
            return

    for wid in workspace_ids:
        async with AsyncSessionLocal() as db:
            try:
                await SocialLeadService(db, wid).scan()
            except Exception as exc:  # pragma: no cover - one bad workspace shouldn't kill the sweep
                print(f"[scheduler] social-lead scan failed for workspace {wid}: {exc}")


async def _advance_video_jobs() -> None:
    """Starts queued Veo generations and polls running ones through to a
    downloaded video or a recorded failure."""
    async with AsyncSessionLocal() as db:
        try:
            n = await advance_pending_jobs(db)
            if n:
                print(f"[scheduler] advanced {n} video generation job(s)")
        except Exception as exc:  # pragma: no cover - best effort
            print(f"[scheduler] video job sweep error: {exc}")


async def _run_scheduled_automations() -> None:
    """Every workspace with an enabled 'on a schedule' automation gets a tick
    each sweep; cadence gating (hourly/daily/weekly) happens per-rule inside
    the automation bus, so calling this every sweep is cheap and safe."""
    async with AsyncSessionLocal() as db:
        try:
            res = await db.execute(
                select(Automation.workspace_id)
                .where(
                    Automation.trigger == AutomationTrigger.SCHEDULE,
                    Automation.enabled.is_(True),
                )
                .distinct()
            )
            workspace_ids = [row[0] for row in res.all()]
        except Exception as exc:  # pragma: no cover - best effort
            print(f"[scheduler] failed to list schedule-trigger workspaces: {exc}")
            return

    for wid in workspace_ids:
        async with AsyncSessionLocal() as db:
            try:
                await emit_automation(db, wid, "schedule", {"label": "the scheduled tick"})
            except Exception as exc:  # pragma: no cover
                print(f"[scheduler] schedule automation failed for workspace {wid}: {exc}")


async def _loop() -> None:
    interval = max(15, settings.SCHEDULER_INTERVAL_SECONDS)
    print(f"[scheduler] started — sweeping every {interval}s")
    while True:
        try:
            # Only the elected leader actually sweeps — see
            # app.core.scheduler_lock for why this matters once the API runs
            # as more than one replica.
            if await scheduler_lock.try_acquire():
                await scheduler_lock.renew()
                n = await run_due_posts_once()
                if n:
                    print(f"[scheduler] published {n} due post(s)")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # pragma: no cover - keep the loop alive
            print(f"[scheduler] sweep error: {exc}")
        await asyncio.sleep(interval)


def start() -> None:
    global _task
    if not settings.SCHEDULER_ENABLED or _task is not None:
        return
    _task = asyncio.create_task(_loop())


async def stop() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    _task = None
