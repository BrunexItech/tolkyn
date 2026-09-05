from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_context import note_activity
from app.core.actor import Actor
from app.models.post import Post, PostStatus
from app.models.team_member import TeamRole
from app.services.preflight import run_checks
from app.services.social_publish import poll_status, publish_post
from app.services.social_service import SocialService
from app.services.upload_post_client import UploadPostError, upload_post


class PostService:
    def __init__(self, db: AsyncSession, actor: Actor):
        self.db = db
        self.actor = actor
        self.user_id = actor.user_id
        self.workspace_id = actor.workspace_id
        self.social = SocialService(db, actor)

    def _needs_approval(self) -> bool:
        """Owner and admin publish freely; every other role's schedule()/
        publish() call is deferred to a reviewer instead of taking effect."""
        return self.actor.role not in (TeamRole.OWNER, TeamRole.ADMIN)

    # ------------------------------------------------------------------ read
    async def list(
        self, *, status_filter: Optional[str] = None, limit: int = 100, offset: int = 0
    ) -> tuple[List[Post], int]:
        base = select(Post).where(Post.workspace_id == self.workspace_id)
        if status_filter:
            base = base.where(Post.status == status_filter)
        rows = (
            await self.db.execute(base.order_by(Post.created_at.desc()).limit(limit).offset(offset))
        ).scalars().all()
        return list(rows), len(rows)

    async def calendar(self, start: datetime, end: datetime) -> List[Post]:
        """Posts that belong on a day in [start, end] — either scheduled for that
        day, or actually published on it (so immediate publishes show up too)."""
        in_range = lambda col: and_(col.isnot(None), col >= start, col <= end)  # noqa: E731
        res = await self.db.execute(
            select(Post).where(
                Post.workspace_id == self.workspace_id,
                or_(in_range(Post.scheduled_at), in_range(Post.published_at)),
            )
        )
        return list(res.scalars().all())

    async def get(self, post_id: str) -> Post:
        res = await self.db.execute(
            select(Post).where(Post.id == post_id, Post.workspace_id == self.workspace_id)
        )
        post = res.scalar_one_or_none()
        if not post:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
        return post

    async def summary(self) -> Dict[str, int]:
        rows, _ = await self.list(limit=1000)
        return {s.value: sum(1 for p in rows if p.status == s) for s in PostStatus} | {"total": len(rows)}

    # ---------------------------------------------------------------- mutate
    async def create(self, data: Dict[str, Any]) -> Post:
        post = Post(
            title=data.get("title"),
            body=data.get("body", ""),
            platforms=data.get("platforms", []),
            media=data.get("media", []),
            music=data.get("music"),
            link=data.get("link"),
            hashtags=data.get("hashtags", []),
            scheduled_at=data.get("scheduled_at"),
            campaign_id=data.get("campaign_id"),
            source_asset_id=data.get("source_asset_id"),
            status=PostStatus.DRAFT,
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        post.checks = run_checks(post.body, post.platforms, post.media, post.hashtags, post.link, post.title)
        self.db.add(post)
        await self.db.commit()
        await self.db.refresh(post)
        return post

    async def update(self, post_id: str, patch: Dict[str, Any]) -> Post:
        post = await self.get(post_id)
        if post.status in (PostStatus.PUBLISHED, PostStatus.PUBLISHING):
            raise HTTPException(status.HTTP_409_CONFLICT, "A published post can't be edited")
        for k in ("title", "body", "platforms", "media", "music", "link", "hashtags", "scheduled_at", "campaign_id"):
            if k in patch:
                setattr(post, k, patch[k])
        post.checks = run_checks(post.body, post.platforms, post.media, post.hashtags, post.link, post.title)
        post.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(post)
        return post

    async def delete(self, post_id: str) -> None:
        post = await self.get(post_id)
        await self.db.delete(post)
        await self.db.commit()

    async def check(self, post_id: str) -> Dict[str, Any]:
        post = await self.get(post_id)
        post.checks = run_checks(post.body, post.platforms, post.media, post.hashtags, post.link, post.title)
        await self.db.commit()
        return post.checks

    def _provider_job_id(self, post: Post) -> Optional[str]:
        pj = post.provider_jobs or {}
        return pj.get("job_id") if isinstance(pj, dict) else None

    async def schedule(self, post_id: str, when: datetime, tz: Optional[str] = None) -> Post:
        post = await self.get(post_id)
        if self._needs_approval():
            return await self._defer_for_approval(post, when, tz)
        return await self._do_schedule(post, when, tz)

    async def _do_schedule(self, post: Post, when: datetime, tz: Optional[str] = None) -> Post:
        if when <= datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a time in the future")
        checks = run_checks(post.body, post.platforms, post.media, post.hashtags, post.link, post.title)
        post.checks = checks
        if not checks["ok"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fix the errors before scheduling")
        if not post.platforms:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No target platforms")

        # existing provider job -> just move it
        job_id = self._provider_job_id(post)
        if job_id and upload_post.enabled:
            try:
                await upload_post.edit_scheduled(job_id, scheduled_date=when.isoformat())
                post.scheduled_at = when
                post.status = PostStatus.SCHEDULED
                await self.db.commit()
                await self.db.refresh(post)
                note_activity("post.schedule", post_id=post.id)
                return post
            except UploadPostError:
                pass  # fall through to a fresh schedule

        results: Dict[str, Any] = dict(post.per_platform or {})
        provider: Optional[Dict[str, Any]] = None

        if upload_post.enabled:
            username, targets = await self.social.for_publish(list(post.platforms))
            for p in post.platforms:
                if p not in targets:
                    results[p] = {"status": "failed", "error": f"{p} is not connected"}
            if targets:
                outcome = await publish_post(
                    username, targets, post, scheduled_date=when.isoformat(), timezone_name=tz
                )
                results.update(outcome["per_platform"])
                provider = outcome.get("provider")

        post.per_platform = results
        post.provider_jobs = provider
        post.scheduled_at = when
        post.status = PostStatus.SCHEDULED
        await self.db.commit()
        await self.db.refresh(post)
        note_activity("post.schedule", post_id=post.id)
        return post

    async def _defer_for_approval(
        self, post: Post, when: Optional[datetime], tz: Optional[str]
    ) -> Post:
        checks = run_checks(post.body, post.platforms, post.media, post.hashtags, post.link, post.title)
        post.checks = checks
        if not checks["ok"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fix the errors before submitting for approval")
        if not post.platforms:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No target platforms")
        post.status = PostStatus.NEEDS_APPROVAL
        post.pending_scheduled_at = when
        post.pending_timezone = tz
        post.rejection_reason = None
        post.approved_by = None
        post.approved_at = None
        await self.db.commit()
        await self.db.refresh(post)
        note_activity("post.submit_for_approval", post_id=post.id, author_id=self.user_id)
        return post

    async def approve(self, post_id: str) -> Post:
        post = await self.get(post_id)
        if post.status != PostStatus.NEEDS_APPROVAL:
            raise HTTPException(status.HTTP_409_CONFLICT, "This post isn't waiting for approval.")
        post.approved_by = self.user_id
        post.approved_at = datetime.now(timezone.utc)
        note_activity("post.approve", post_id=post.id, author_id=post.owner_id, approver_id=self.user_id)
        if post.pending_scheduled_at:
            when, tz = post.pending_scheduled_at, post.pending_timezone
            post.pending_scheduled_at = None
            post.pending_timezone = None
            return await self._do_schedule(post, when, tz)
        return await self._publish(post)

    async def reject(self, post_id: str, reason: str) -> Post:
        post = await self.get(post_id)
        if post.status != PostStatus.NEEDS_APPROVAL:
            raise HTTPException(status.HTTP_409_CONFLICT, "This post isn't waiting for approval.")
        post.status = PostStatus.DRAFT
        post.rejection_reason = reason
        post.pending_scheduled_at = None
        post.pending_timezone = None
        await self.db.commit()
        await self.db.refresh(post)
        note_activity(
            "post.reject", post_id=post.id, author_id=post.owner_id, reviewer_id=self.user_id, reason=reason
        )
        return post

    async def unschedule(self, post_id: str) -> Post:
        post = await self.get(post_id)
        job_id = self._provider_job_id(post)
        if job_id and upload_post.enabled:
            try:
                await upload_post.cancel_scheduled(job_id)
            except UploadPostError:
                pass
        post.scheduled_at = None
        post.provider_jobs = None
        post.per_platform = {}
        post.status = PostStatus.DRAFT
        await self.db.commit()
        await self.db.refresh(post)
        return post

    async def publish(self, post_id: str) -> Post:
        post = await self.get(post_id)
        if self._needs_approval():
            return await self._defer_for_approval(post, None, None)
        return await self._publish(post)

    async def retry(self, post_id: str) -> Post:
        """Re-send only the platforms that failed (or all, if none are marked)."""
        post = await self.get(post_id)
        if post.status not in (PostStatus.FAILED, PostStatus.PARTIAL):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Only a failed or partly-failed post can be retried",
            )
        failed = [
            p for p, r in (post.per_platform or {}).items()
            if (r or {}).get("status") == "failed" and p in (post.platforms or [])
        ]
        return await self._publish(post, platforms=failed or list(post.platforms))

    async def run_due(self) -> int:
        now = datetime.now(timezone.utc)
        res = await self.db.execute(
            select(Post).where(
                Post.workspace_id == self.workspace_id,
                Post.status == PostStatus.SCHEDULED,
                Post.scheduled_at.isnot(None),
                Post.scheduled_at <= now,
            )
        )
        due = list(res.scalars().all())
        n = 0
        for post in due:
            if self._provider_job_id(post):
                # Upload-Post runs this one on its own infrastructure
                await self.refresh_status(post.id)
                continue
            await self._publish(post)
            n += 1
        return n

    async def _publish(self, post: Post, platforms: Optional[List[str]] = None) -> Post:
        wanted = list(platforms) if platforms is not None else list(post.platforms)
        checks = run_checks(post.body, post.platforms, post.media, post.hashtags, post.link, post.title)
        post.checks = checks
        if not checks["ok"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fix the errors before publishing")
        if not wanted:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No target platforms")

        post.status = PostStatus.PUBLISHING
        await self.db.commit()

        username, targets = await self.social.for_publish(wanted)
        results: Dict[str, Any] = dict(post.per_platform or {})

        # platforms the user picked that aren't connected
        for platform in wanted:
            if platform not in targets:
                results[platform] = {"status": "failed", "error": f"{platform} is not connected"}

        outcome = await publish_post(username, targets, post)
        results.update(outcome["per_platform"])
        post.per_platform = results
        post.provider_jobs = outcome.get("provider") or None
        post.published_at = datetime.now(timezone.utc)
        prev_status = post.status
        post.status = self._status_from_results(results)
        note_activity("post.publish", post_id=post.id, status=post.status.value)
        await self.db.commit()
        await self.db.refresh(post)
        await self._emit_published(post, prev_status)
        return post

    @staticmethod
    def _status_from_results(results: Dict[str, Any]) -> PostStatus:
        states = [r.get("status") for r in results.values()]
        if not states:
            return PostStatus.FAILED
        if any(s == "publishing" for s in states):
            return PostStatus.PUBLISHING
        if all(s == "scheduled" for s in states):
            return PostStatus.SCHEDULED
        ok = sum(1 for s in states if s in ("published", "scheduled"))
        fail = sum(1 for s in states if s == "failed")
        if fail == 0:
            return PostStatus.PUBLISHED
        if ok:
            return PostStatus.PARTIAL
        return PostStatus.FAILED

    async def refresh_status(self, post_id: str) -> Post:
        """Poll Upload-Post for an async/scheduled post and fold the result in.
        A still-pending scheduled job is left untouched."""
        post = await self.get(post_id)
        update = await poll_status(post.provider_jobs or {})
        if not update:
            return post

        aggregate = update.get("aggregate")
        per = update.get("per_platform") or {}

        if per:
            merged = dict(post.per_platform or {})
            merged.update(per)
            post.per_platform = merged
            prev_status = post.status
            post.status = self._status_from_results(merged)
            if post.status in (PostStatus.PUBLISHED, PostStatus.PARTIAL):
                post.published_at = post.published_at or datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(post)
            await self._emit_published(post, prev_status)
        elif aggregate == "in_progress" and post.status == PostStatus.SCHEDULED:
            post.status = PostStatus.PUBLISHING
            await self.db.commit()
            await self.db.refresh(post)
        return post

    async def _emit_published(self, post: Post, prev_status: PostStatus) -> None:
        if post.status != PostStatus.PUBLISHED or prev_status == PostStatus.PUBLISHED:
            return
        from app.services.automation_bus import emit

        try:
            await emit(
                self.db,
                self.workspace_id,
                "post_published",
                {
                    "post_id": post.id,
                    "platforms": list(post.platforms or []),
                    "body": (post.body or "")[:200],
                    "label": f"post published to {', '.join(post.platforms or [])}",
                },
            )
        except Exception as exc:  # noqa: BLE001 - automations must never break publishing
            print(f"[automations] post_published emit failed: {exc}")
