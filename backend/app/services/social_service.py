"""Connected social accounts, backed by Upload-Post.

Upload-Post keeps one "profile" per Tolkyn workspace; each profile holds the
OAuth connections the user makes through Upload-Post's own platform apps (so no
per-network app review is needed). We mirror that state into `social_connections`
so the rest of the app keeps working against a local table.
"""
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple, Union

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import Actor
from app.core.config import settings
from app.models.provider_profile import ProviderProfile
from app.models.social_connection import ConnectionStatus, SocialConnection
from app.services.upload_post_client import (
    CONNECTABLE_PLATFORMS,
    UploadPostError,
    upload_post,
)

_PROVIDER = "upload_post"
_SYNC_TTL = timedelta(seconds=45)
_VALID = set(CONNECTABLE_PLATFORMS)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class SocialService:
    def __init__(self, db: AsyncSession, actor: Union[Actor, str]):
        self.db = db
        if isinstance(actor, Actor):
            self.user_id = actor.user_id
            self.workspace_id = actor.workspace_id
        else:
            # Plain workspace id (already resolved by app.core.actor.get_workspace_id
            # at the endpoint layer) — every call site outside PostService uses this.
            self.user_id = actor
            self.workspace_id = actor

    # ---- profile plumbing ------------------------------------------
    def _profile_username(self) -> str:
        digest = hashlib.sha1(self.workspace_id.encode()).hexdigest()[:20]
        return f"om_{digest}"

    async def _profile_row(self) -> Optional[ProviderProfile]:
        res = await self.db.execute(
            select(ProviderProfile).where(
                ProviderProfile.workspace_id == self.workspace_id,
                ProviderProfile.provider == _PROVIDER,
            )
        )
        return res.scalar_one_or_none()

    async def ensure_profile(self) -> str:
        """Return the Upload-Post profile username for this workspace, creating
        the remote profile + local mapping row on first use."""
        if not upload_post.enabled:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Social publishing is not configured yet. Add UPLOAD_POST_API_KEY to the backend .env.",
            )
        row = await self._profile_row()
        username = row.external_username if row else self._profile_username()

        try:
            remote = await upload_post.get_profile(username)
            if remote is None:
                await upload_post.create_profile(username)
        except UploadPostError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Upload-Post: {exc.message}")

        if not row:
            row = ProviderProfile(
                provider=_PROVIDER,
                external_username=username,
                workspace_id=self.workspace_id,
            )
            self.db.add(row)
            await self.db.commit()
        return username

    # ---- sync remote -> local -------------------------------------
    async def sync(self, force: bool = False) -> None:
        if not upload_post.enabled:
            return
        row = await self._profile_row()
        if row and not force and row.last_synced_at:
            if _now() - _aware(row.last_synced_at) < _SYNC_TTL:
                return

        try:
            username = await self.ensure_profile()
            profile = await upload_post.get_profile(username)
        except (UploadPostError, HTTPException):
            return
        if not profile:
            return

        accounts = profile.get("social_accounts") or {}
        existing = {c.platform: c for c in await self.list(_skip_sync=True)}

        for platform in CONNECTABLE_PLATFORMS:
            raw = accounts.get(platform)
            conn = existing.get(platform)
            is_conn = isinstance(raw, dict) and bool(raw)

            if is_conn:
                if not conn:
                    conn = SocialConnection(
                        platform=platform,
                        owner_id=self.user_id,
                        workspace_id=self.workspace_id,
                    )
                    self.db.add(conn)
                reauth = bool(raw.get("reauth_required"))
                conn.status = ConnectionStatus.ERROR if reauth else ConnectionStatus.CONNECTED
                conn.handle = raw.get("handle") or raw.get("username")
                conn.display_name = raw.get("display_name")
                conn.avatar_url = raw.get("social_images")
                conn.account_ref = raw.get("username") or raw.get("handle")
                conn.scopes = ["read", "publish"]
                conn.last_error = "Reconnect required" if reauth else None
                conn.last_synced_at = _now()
                if not conn.connected_at and not reauth:
                    conn.connected_at = _now()
            elif conn and conn.status != ConnectionStatus.DISCONNECTED:
                conn.status = ConnectionStatus.DISCONNECTED
                conn.connected_at = None
                conn.last_error = None
                conn.last_synced_at = _now()

        prow = await self._profile_row()
        if prow:
            prow.last_synced_at = _now()
        await self.db.commit()

    # ---- reads ---------------------------------------------------
    async def list(self, _skip_sync: bool = False) -> List[SocialConnection]:
        if not _skip_sync:
            await self.sync()
        res = await self.db.execute(
            select(SocialConnection).where(SocialConnection.workspace_id == self.workspace_id)
        )
        return list(res.scalars().all())

    async def connected_platforms(self) -> List[str]:
        return [
            c.platform for c in await self.list()
            if c.status == ConnectionStatus.CONNECTED and c.platform in _VALID
        ]

    async def get(self, platform: str) -> Optional[SocialConnection]:
        res = await self.db.execute(
            select(SocialConnection).where(
                SocialConnection.workspace_id == self.workspace_id,
                SocialConnection.platform == platform,
            )
        )
        return res.scalar_one_or_none()

    # ---- connect / disconnect -----------------------------------
    async def _connect_page(self, platforms: List[str]) -> str:
        username = await self.ensure_profile()
        base = settings.FRONTEND_URL.rstrip("/")
        redirect = f"{base}/dashboard/accounts?connected=1"
        try:
            return await upload_post.generate_connect_url(
                username,
                redirect_url=redirect,
                logo_image=f"{base}/tolkyn_logo.png",
                connect_title="Tolkyn",
                connect_description="Link an account so Tolkyn can publish, listen and report on it.",
                platforms=platforms,
            )
        except UploadPostError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Upload-Post: {exc.message}")

    async def start_connect(self, platform: str) -> Dict[str, object]:
        if platform not in _VALID:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{platform}' can't be connected here")
        # The hosted connect page is Upload-Post's reliable, branded flow. It handles
        # every platform's quirks (FB Pages, TikTok business, re-auth) and binds the
        # connection to our profile server-side.
        return {"authorize_url": await self._connect_page([platform]), "state": None, "expires_in": None}

    async def hosted_connect_url(self) -> Dict[str, str]:
        return {"url": await self._connect_page(CONNECTABLE_PLATFORMS)}

    async def disconnect(self, platform: str) -> Dict[str, str]:
        conn = await self.get(platform)
        if conn:
            conn.status = ConnectionStatus.DISCONNECTED
            conn.access_token_enc = None
            conn.connected_at = None
            conn.last_error = None
            conn.last_synced_at = _now()
        # keep the next list() from immediately re-syncing (which would revert this
        # until the user finishes revoking on the hosted page)
        prow = await self._profile_row()
        if prow:
            prow.last_synced_at = _now()
        await self.db.commit()
        return await self.hosted_connect_url()

    async def refresh_stats(self) -> None:
        """Pull live follower counts from Upload-Post analytics onto the rows.
        Best-effort; only used by the explicit Refresh action."""
        if not upload_post.enabled:
            return
        conns = [c for c in await self.list(_skip_sync=True) if c.status == ConnectionStatus.CONNECTED]
        if not conns:
            return
        username = (await self._profile_row()).external_username if await self._profile_row() else None
        if not username:
            return
        try:
            data = await upload_post.analytics(username, [c.platform for c in conns])
        except UploadPostError:
            return
        changed = False
        for c in conns:
            m = data.get(c.platform)
            if isinstance(m, dict):
                f = int(m.get("followers") or 0)
                if f and f != (c.followers or 0):
                    c.followers = f
                    changed = True
        if changed:
            await self.db.commit()

    # ---- used by the publisher ---------------------------------
    async def for_publish(self, platforms: List[str]) -> Tuple[str, List[str]]:
        username = await self.ensure_profile()
        connected = set(await self.connected_platforms())
        targets = [p for p in platforms if p in connected]
        return username, targets
