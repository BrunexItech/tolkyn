"""Per-day AI-generation caps (images / videos), controlled by the super admin.

Effective cap resolution, most specific first:
  1. the workspace owner's per-user override — User.daily_image_limit / _video_limit
  2. the owner's package  — Package.limits["images_daily" / "videos_daily"]
  3. no cap

A value of 0 means "blocked entirely"; NULL/blank means "inherit". Counts are
per workspace and reset at UTC midnight.
"""
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_asset import AssetKind, GeneratedAsset
from app.models.user import User
from app.models.video_job import VideoJob

Kind = Literal["image", "video"]

_USER_FIELD = {"image": "daily_image_limit", "video": "daily_video_limit"}
_PKG_KEY = {"image": "images_daily", "video": "videos_daily"}
_LABEL = {"image": "images", "video": "videos"}


def _coerce(v) -> Optional[int]:
    if v in (None, ""):
        return None
    try:
        return max(0, int(v))
    except (TypeError, ValueError):
        return None


def effective_daily_limit(user: User, kind: Kind) -> Optional[int]:
    """None == unlimited. 0 == blocked."""
    override = _coerce(getattr(user, _USER_FIELD[kind], None))
    if override is not None:
        return override
    pkg = getattr(user, "package", None)
    if pkg is not None and isinstance(getattr(pkg, "limits", None), dict):
        return _coerce(pkg.limits.get(_PKG_KEY[kind]))
    return None


async def count_today(db: AsyncSession, workspace_id: str, kind: Kind) -> int:
    midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if kind == "video":
        q = (
            select(func.count())
            .select_from(VideoJob)
            .where(VideoJob.workspace_id == workspace_id, VideoJob.created_at >= midnight)
        )
    else:
        q = (
            select(func.count())
            .select_from(GeneratedAsset)
            .where(
                GeneratedAsset.workspace_id == workspace_id,
                GeneratedAsset.kind == AssetKind.IMAGE,
                GeneratedAsset.created_at >= midnight,
            )
        )
    return int((await db.execute(q)).scalar() or 0)


async def enforce_daily_limit(db: AsyncSession, user: User, kind: Kind) -> None:
    cap = effective_daily_limit(user, kind)
    if cap is None:
        return
    used = await count_today(db, user.id, kind)
    if used >= cap:
        if cap == 0:
            detail = (
                f"{_LABEL[kind].capitalize()} generation is turned off for your workspace. "
                "Contact your platform administrator."
            )
        else:
            detail = (
                f"You've used today's {_LABEL[kind]} allowance ({used}/{cap}). "
                "It resets at midnight UTC — contact your platform administrator to raise the limit."
            )
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail)
