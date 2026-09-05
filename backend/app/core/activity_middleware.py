"""Logs every authenticated tenant API call so the super-admin portal can show
what users actually do on the platform. Deliberately excludes /admin/* traffic
(the super admin's own actions aren't tenant activity) and any unauthenticated
request (nothing to attribute it to). A logging failure must never break the
real request, so every failure path is swallowed and printed, not raised."""
import re
import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.activity_context import open_bucket
from app.core.config import settings
from app.core.security import get_token_payload

_ID_LIKE = re.compile(r"^[0-9a-fA-F-]{8,}$|^\d+$")


def _derive_action(method: str, rel_path: str) -> str:
    parts = [p for p in rel_path.strip("/").split("/") if p]
    if not parts:
        return method.lower()
    resource = parts[0]
    verb = {"GET": "view", "POST": "create", "PATCH": "update", "PUT": "update", "DELETE": "delete"}.get(
        method.upper(), method.lower()
    )
    extra = [p for p in parts[1:] if not _ID_LIKE.match(p)]
    return f"{resource}.{extra[-1]}" if extra else f"{resource}.{verb}"


class ActivityLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        prefix = settings.API_V1_PREFIX
        path = request.url.path
        should_log = path.startswith(prefix) and not path.startswith(f"{prefix}/admin")

        # Opened *before* call_next so a service several layers deep inside the
        # request can attach a precise action name via note_activity() — see
        # app/core/activity_context.py for why this needs a mutable dict
        # rather than a plain ContextVar.set().
        bucket = open_bucket()
        start = time.monotonic()
        response = await call_next(request)

        if should_log:
            duration_ms = int((time.monotonic() - start) * 1000)
            try:
                await self._log(request, response, path[len(prefix):], duration_ms, bucket)
            except Exception as exc:  # noqa: BLE001 - never break the real request
                print(f"[activity] log failed: {exc}")
        return response

    @staticmethod
    async def _log(request: Request, response, rel_path: str, duration_ms: int, bucket: dict) -> None:
        user_id = _extract_user_id(request)
        if not user_id:
            return  # only track authenticated tenant traffic

        from sqlalchemy import select as _select

        from app.db.base import AsyncSessionLocal
        from app.models.activity_log import ActivityLog
        from app.models.team_member import MemberStatus, TeamMember

        # A service that ran during this request may have called
        # note_activity() with a precise business-event name (and structured
        # detail) — prefer that over the generic URL-derived label.
        action = bucket.get("action") or _derive_action(request.method, rel_path)
        detail = bucket.get("detail")

        async with AsyncSessionLocal() as db:
            # workspace_id == user_id for everyone except a real team member,
            # whose actions belong to the workspace that invited them — keep
            # this resolution in sync with app.core.actor.get_actor().
            member = (
                await db.execute(
                    _select(TeamMember)
                    .where(TeamMember.user_id == user_id, TeamMember.status == MemberStatus.ACTIVE)
                    .order_by(TeamMember.created_at.asc())
                )
            ).scalars().first()  # tolerate the same rare duplicate-row case as app.core.actor.get_actor
            workspace_id = member.workspace_id if member else user_id

            db.add(
                ActivityLog(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    method=request.method,
                    path=rel_path[:500],
                    action=action[:120],
                    detail=detail,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                    ip_address=request.client.host if request.client else None,
                    user_agent=(request.headers.get("user-agent") or "")[:400],
                )
            )
            await db.commit()


def _extract_user_id(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    payload = get_token_payload(auth[7:])
    if payload.get("type") != "access":
        return None
    return payload.get("sub")
