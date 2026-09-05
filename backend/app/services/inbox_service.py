import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inbox import InboxMessage, InboxThread, ThreadKind, ThreadStatus
from app.models.provider_profile import ProviderProfile
from app.services import whatsapp_web_service
from app.services.inbox_provider import fetch_threads
from app.services.inbox_seed import build_threads
from app.services.social_service import SocialService
from app.services.upload_post_client import UploadPostError, upload_post
from app.services.whatsapp_web_service import WhatsAppWebError

# workspace_id -> last successful provider sync epoch
_LAST_SYNC: Dict[str, float] = {}
_SYNC_NOTES: Dict[str, List[Dict[str, str]]] = {}
_SYNC_TTL = 300.0  # 5 min


def _parse_dt(v: Any) -> Optional[datetime]:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        # LinkedIn's "created.time" is epoch *milliseconds*; everyone else
        # we've seen uses seconds. >1e12 is comfortably past any real
        # seconds-based timestamp, so treat it as milliseconds.
        seconds = v / 1000 if v > 1e12 else v
        try:
            return datetime.fromtimestamp(float(seconds), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    s = str(v).strip()
    # normalise "+0000" -> "+00:00", trailing "Z"
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    if len(s) >= 5 and (s[-5] in "+-") and s[-3] != ":":
        s = s[:-2] + ":" + s[-2:]
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


class InboxService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id
        self.social = SocialService(db, user_id)

    async def _profile_username(self) -> Optional[str]:
        res = await self.db.execute(
            select(ProviderProfile).where(
                ProviderProfile.workspace_id == self.workspace_id,
                ProviderProfile.provider == "upload_post",
            )
        )
        row = res.scalar_one_or_none()
        return row.external_username if row else None

    # ---------------------------------------------------------- seeding
    async def _thread_count(self) -> int:
        return (
            await self.db.execute(
                select(func.count()).select_from(InboxThread).where(
                    InboxThread.workspace_id == self.workspace_id
                )
            )
        ).scalar() or 0

    async def _ensure_seed(self) -> None:
        """Demo data only when there is no real provider to pull from."""
        if upload_post.enabled:
            return
        if await self._thread_count() == 0:
            for t in build_threads(self.workspace_id, self.user_id):
                t.source = "seed"
                self.db.add(t)
            await self.db.commit()

    # Sources fed by a real provider, never demo/seed data. Anything else is
    # leftover placeholder content from before a real connection existed.
    _REAL_SOURCES = ("upload_post", "whatsapp_web")

    async def _purge_seed(self) -> None:
        """Demo/placeholder threads only ever exist because there was no real
        provider configured when they were created (there's no endpoint that
        lets a real user create an inbox thread from scratch, so anything
        that isn't tagged with a real source is leftover demo/test data,
        whether it ended up tagged 'seed' or fell through to the model's
        'manual' default). Once we have real access, purge it so it doesn't
        sit there forever indistinguishable from real comments."""
        res = await self.db.execute(
            select(InboxThread).where(
                InboxThread.workspace_id == self.workspace_id,
                InboxThread.source.notin_(self._REAL_SOURCES),
            )
        )
        stale = res.scalars().all()
        if not stale:
            return
        for t in stale:
            await self.db.delete(t)
        await self.db.commit()

    # ------------------------------------------------------ provider sync
    async def sync(self, force: bool = False) -> None:
        if not upload_post.enabled:
            await self._ensure_seed()
            return

        await self._purge_seed()

        last = _LAST_SYNC.get(self.workspace_id, 0.0)
        if not force and time.time() - last < _SYNC_TTL:
            return

        username = await self._profile_username()
        if not username:
            return
        platforms = await self.social.connected_platforms()
        if not platforms:
            _LAST_SYNC[self.workspace_id] = time.time()
            return

        try:
            result = await fetch_threads(username, platforms)
        except UploadPostError:
            return
        fetched = result.get("threads", [])
        _SYNC_NOTES[self.workspace_id] = result.get("notes", [])

        # index existing provider threads by external_id
        res = await self.db.execute(
            select(InboxThread)
            .options(selectinload(InboxThread.messages))
            .where(
                InboxThread.workspace_id == self.workspace_id,
                InboxThread.source == "upload_post",
            )
        )
        existing = {t.external_id: t for t in res.scalars().all() if t.external_id}
        new_threads: list[tuple[InboxThread, str]] = []  # (thread, first inbound body) for automations

        for f in fetched:
            t = existing.get(f["external_id"])
            last_at = _parse_dt(f.get("last_message_at")) or _now()
            if t is None:
                t = InboxThread(
                    platform=f["platform"],
                    kind=ThreadKind(f["kind"]),
                    status=ThreadStatus.OPEN,
                    author_name=f["author_name"],
                    author_handle=f.get("author_handle"),
                    context=f.get("context"),
                    permalink=f.get("permalink"),
                    sentiment=f.get("sentiment"),
                    priority=f.get("priority", 1),
                    unread=1,
                    last_message_at=last_at,
                    source="upload_post",
                    external_id=f["external_id"],
                    ref=f.get("ref"),
                    owner_id=self.user_id,
                    workspace_id=self.workspace_id,
                )
                self.db.add(t)
                for mi, m in enumerate(f.get("messages") or []):
                    t.messages.append(
                        InboxMessage(
                            direction=m.get("direction", "in"),
                            author_name=m.get("author_name") or f["author_name"],
                            body=m.get("body") or "",
                            external_id=str(m.get("external_id") or f"{f['external_id']}:{mi}"),
                            at=_parse_dt(m.get("at")) or last_at,
                            like_count=m.get("like_count"),
                        )
                    )
                inbound_body = next(
                    (m.get("body") for m in reversed(f.get("messages") or []) if m.get("direction", "in") == "in"),
                    "",
                )
                new_threads.append((t, inbound_body or ""))
            else:
                by_external_id = {m.external_id: m for m in t.messages if m.external_id}
                added_inbound = False
                for mi, m in enumerate(f.get("messages") or []):
                    eid = str(m.get("external_id") or f"{f['external_id']}:{mi}")
                    existing_msg = by_external_id.get(eid)
                    if existing_msg is not None:
                        # Same comment we already had — but its like count
                        # moves on, and if it was first stored with a parsing
                        # bug (e.g. blank text from a platform-specific field
                        # we didn't know about yet), a resync should repair
                        # it rather than leave the bad copy forever.
                        new_likes = m.get("like_count")
                        if new_likes is not None:
                            existing_msg.like_count = new_likes
                        new_body = m.get("body")
                        if new_body and new_body != existing_msg.body:
                            existing_msg.body = new_body
                        new_author = m.get("author_name")
                        if new_author and new_author != existing_msg.author_name:
                            existing_msg.author_name = new_author
                        continue
                    t.messages.append(
                        InboxMessage(
                            direction=m.get("direction", "in"),
                            author_name=m.get("author_name") or f["author_name"],
                            body=m.get("body") or "",
                            external_id=eid,
                            at=_parse_dt(m.get("at")) or last_at,
                            like_count=m.get("like_count"),
                        )
                    )
                    if m.get("direction", "in") == "in":
                        added_inbound = True
                if added_inbound:
                    t.unread = 1
                    t.last_message_at = last_at
                    if t.status == ThreadStatus.DONE:
                        t.status = ThreadStatus.OPEN
                t.ref = f.get("ref") or t.ref
                if f.get("permalink"):
                    t.permalink = f["permalink"]
                # thread-level author was set at creation from the same
                # source data — repair it too if it's since resolved better
                if f.get("author_name") and f["author_name"] != "Someone":
                    t.author_name = f["author_name"]
                    t.author_handle = f.get("author_handle")

        await self.db.commit()
        _LAST_SYNC[self.workspace_id] = time.time()
        await self._emit_new_threads(new_threads)

    async def refresh(self) -> None:
        _LAST_SYNC.pop(self.workspace_id, None)
        await self.sync(force=True)

    async def _emit_new_threads(self, new_threads: list) -> None:
        if not new_threads:
            return
        from app.services.automation_bus import emit

        trigger_by_kind = {
            ThreadKind.COMMENT: "new_comment",
            ThreadKind.MENTION: "new_mention",
            ThreadKind.DM: "inbound_message",
            ThreadKind.REVIEW: "new_comment",
        }
        for t, body in new_threads:
            trigger = trigger_by_kind.get(t.kind, "new_comment")
            try:
                await emit(
                    self.db,
                    self.workspace_id,
                    trigger,
                    {
                        "thread_id": t.id,
                        "platform": t.platform,
                        "message": body,
                        "author_name": t.author_name,
                        "label": f"{t.author_name} on {t.platform}",
                    },
                )
            except Exception as exc:  # noqa: BLE001 - automations must never break inbox sync
                print(f"[automations] {trigger} emit failed: {exc}")

    # ------------------------------------------------------------- reads
    async def list_threads(
        self,
        *,
        platform: Optional[str] = None,
        kind: Optional[str] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        assigned: Optional[bool] = None,
    ) -> List[InboxThread]:
        await self.sync()
        q = (
            select(InboxThread)
            .options(selectinload(InboxThread.messages))
            .where(InboxThread.workspace_id == self.workspace_id)
        )
        if platform:
            q = q.where(InboxThread.platform == platform)
        if kind:
            q = q.where(InboxThread.kind == kind)
        if status_filter:
            q = q.where(InboxThread.status == status_filter)
        if assigned is True:
            q = q.where(InboxThread.assignee.isnot(None))
        if assigned is False:
            q = q.where(InboxThread.assignee.is_(None))
        if search:
            like = f"%{search}%"
            q = q.where(or_(InboxThread.author_name.ilike(like), InboxThread.context.ilike(like)))
        q = q.order_by(InboxThread.priority.desc(), InboxThread.last_message_at.desc())
        return list((await self.db.execute(q)).scalars().all())

    async def get_thread(self, thread_id: str) -> InboxThread:
        res = await self.db.execute(
            select(InboxThread)
            .options(selectinload(InboxThread.messages))
            .where(InboxThread.id == thread_id, InboxThread.workspace_id == self.workspace_id)
        )
        t = res.scalar_one_or_none()
        if not t:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Thread not found")
        return t

    async def mark_read(self, thread_id: str) -> InboxThread:
        t = await self.get_thread(thread_id)
        t.unread = 0
        await self.db.commit()
        return t

    # ------------------------------------------------------------- reply
    async def reply(self, thread_id: str, body: str, via: str = "manual") -> InboxThread:
        t = await self.get_thread(thread_id)
        body = body.strip()
        if not body:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reply is empty")

        ext_message_id: Optional[str] = None
        if t.source == "upload_post" and t.ref:
            username = await self._profile_username()
            if not username:
                raise HTTPException(status.HTTP_409_CONFLICT, "Connect the account again to reply")
            try:
                if t.kind == ThreadKind.DM:
                    rid = t.ref.get("dm_recipient_id")
                    if not rid:
                        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No recipient for this DM")
                    res = await upload_post.dm_send(username, rid, body, platform=t.platform)
                    ext_message_id = res.get("message_id")
                else:
                    res = await upload_post.create_comment(
                        t.platform, username, body,
                        comment_id=t.ref.get("comment_id"),
                        post_id=t.ref.get("post_id"),
                    )
                    ext_message_id = res.get("id")
            except UploadPostError as exc:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"{t.platform}: {exc.message}")
        elif t.source == "whatsapp_web" and t.ref:
            # Prefer the exact addressing identity WhatsApp used (wa_jid) — it
            # may be a "<n>@lid", which a phone-number JID can't substitute for.
            target = t.ref.get("wa_jid") or t.ref.get("wa_phone")
            if not target:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "No WhatsApp number for this conversation")
            try:
                res = await whatsapp_web_service.send_message(self.workspace_id, target, body)
                ext_message_id = res.get("id")
            except WhatsAppWebError as exc:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"WhatsApp: {exc.message}")

        t.messages.append(
            InboxMessage(
                direction="out",
                author_name="You",
                body=body,
                via=via,
                external_id=ext_message_id,
                at=_now(),
            )
        )
        t.last_message_at = _now()
        t.unread = 0
        await self.db.commit()
        return await self.get_thread(thread_id)

    async def set_status(self, thread_id: str, new_status: str) -> InboxThread:
        t = await self.get_thread(thread_id)
        t.status = ThreadStatus(new_status)
        await self.db.commit()
        return t

    async def assign(self, thread_id: str, assignee: Optional[str]) -> InboxThread:
        t = await self.get_thread(thread_id)
        t.assignee = assignee
        await self.db.commit()
        return t

    async def summary(self) -> Dict[str, Any]:
        threads = await self.list_threads()
        by_platform: Dict[str, int] = {}
        by_kind: Dict[str, int] = {}
        for t in threads:
            by_platform[t.platform] = by_platform.get(t.platform, 0) + 1
            by_kind[t.kind.value] = by_kind.get(t.kind.value, 0) + 1
        return {
            "total": len(threads),
            "unread": sum(1 for t in threads if t.unread),
            "open": sum(1 for t in threads if t.status == ThreadStatus.OPEN),
            "done": sum(1 for t in threads if t.status == ThreadStatus.DONE),
            "negative": sum(1 for t in threads if t.sentiment == "negative"),
            "by_platform": by_platform,
            "by_kind": by_kind,
            "live": upload_post.enabled,
            "notes": _SYNC_NOTES.get(self.workspace_id, []),
        }
