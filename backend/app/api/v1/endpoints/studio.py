from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.core.limits import enforce_daily_limit
from app.db import get_db
from app.models.generated_asset import AssetKind
from app.models.user import User
from app.schemas.studio import (
    AssetList,
    AssetResponse,
    CopyRequest,
    CopyResponse,
    ImageChatRequest,
    ImageChatResponse,
    ImageRequest,
    ImageResponse,
    PromptRequest,
    PromptResponse,
    SaveCaptionRequest,
)
from app.services.content_ai import build_prompt, generate_copy, generate_image
from app.services.image_chat import run_turn
from app.services.studio_service import StudioService

router = APIRouter()

_MEDIA_ROOT = Path(__file__).resolve().parents[4] / "media"


def _resolve_media(url: str | None) -> str | None:
    if not url or not url.startswith("/media/"):
        return None
    p = (_MEDIA_ROOT / url[len("/media/"):]).resolve()
    if _MEDIA_ROOT.resolve() in p.parents and p.is_file():
        return str(p)
    return None


async def _owner(db: AsyncSession, workspace_id: str) -> User:
    """The workspace owner's User row — carries the daily-limit fields + package."""
    u = (await db.execute(select(User).where(User.id == workspace_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    return u


@router.post("/prompt", response_model=PromptResponse)
async def studio_prompt(
    body: PromptRequest,
    _uid: str = Depends(get_workspace_id),
):
    return PromptResponse(**await build_prompt(body.intent, body.brief))


@router.post("/copy", response_model=CopyResponse)
async def studio_copy(
    body: CopyRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    result = await generate_copy(body.prompt, body.platforms, count=body.count, tone=body.tone)
    asset_id = None
    has_any = any(g["variants"] for g in result["results"])
    if body.save and has_any:
        asset = await StudioService(db, user_id).save(
            AssetKind.COPY, body.prompt, platform=", ".join(body.platforms), payload=result
        )
        asset_id = asset.id
    return CopyResponse(asset_id=asset_id, **result)


@router.post("/captions", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def save_caption(
    body: SaveCaptionRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Explicitly saves one caption variant under a user-given title. This is
    the only way a caption ends up in the Composer's 'Saved captions' picker —
    generating no longer auto-saves anything."""
    asset = await StudioService(db, user_id).save(
        AssetKind.COPY,
        body.brief.strip() or body.text,
        platform=body.platform,
        title=body.title.strip(),
        payload={"text": body.text, "hashtags": body.hashtags, "angle": body.angle},
    )
    return AssetResponse.model_validate(asset)


@router.post("/image", response_model=ImageResponse)
async def studio_image(
    body: ImageRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await enforce_daily_limit(db, await _owner(db, user_id), "image")
    try:
        result = await generate_image(
            body.prompt,
            size=body.size,
            quality=body.quality.value,
            style=body.style,
            draft=body.draft,
            input_image_path=_resolve_media(body.input_image_url),
            as_logo=body.as_logo,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Image generation failed: {exc}")
    asset_id = None
    if body.save:
        asset = await StudioService(db, user_id).save(
            AssetKind.IMAGE, body.prompt, title=body.prompt[:120], image_url=result["url"],
            payload={"size": result["size"], "quality": result["quality"], "style": result["style"]},
        )
        asset_id = asset.id
    return ImageResponse(asset_id=asset_id, **result)


@router.post("/image/chat", response_model=ImageChatResponse)
async def studio_image_chat(
    body: ImageChatRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await enforce_daily_limit(db, await _owner(db, user_id), "image")
    attachment = _resolve_media(body.attachment_url)
    previous = _resolve_media(body.previous_image_url)
    try:
        result = await run_turn(
            body.instruction.strip(),
            has_attachment=attachment is not None,
            has_previous=previous is not None,
            attachment_path=attachment,
            previous_path=previous,
            history=[{"role": t.role, "text": t.text} for t in body.history],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Image generation failed: {exc}")

    asset = await StudioService(db, user_id).save(
        AssetKind.IMAGE,
        result["prompt"],
        title=result["prompt"][:120],
        image_url=result["url"],
        payload={
            "size": result["size"],
            "quality": result["quality"],
            "operation": result["operation"],
        },
    )
    return ImageChatResponse(asset_id=asset.id, **result)


@router.get("/assets", response_model=AssetList)
async def studio_assets(
    kind: str | None = Query(None),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    items = await StudioService(db, user_id).list(kind)
    return AssetList(items=[AssetResponse.model_validate(a) for a in items])


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await StudioService(db, user_id).delete(asset_id)
