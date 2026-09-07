from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.models.generated_asset import AssetKind
from app.models.user import User
from app.schemas.studio import (
    AssetList,
    AssetResponse,
    BrandKitResponse,
    BrandKitUpdate,
    CopyRequest,
    CopyResponse,
    ImageChatRequest,
    ImageJobResponse,
    ImageRequest,
    PromptRequest,
    PromptResponse,
    SaveCaptionRequest,
)
from app.services.content_ai import build_prompt, generate_copy
from app.services.image_job_service import ImageJobService
from app.services.studio_service import StudioService

router = APIRouter()

async def _owner(db: AsyncSession, workspace_id: str) -> User:
    """The workspace owner's User row — carries the brand-kit fields."""
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


def _job_response(job) -> ImageJobResponse:
    return ImageJobResponse(
        id=job.id,
        status=job.status.value if hasattr(job.status, "value") else str(job.status),
        mode=job.mode,
        url=job.result_url,
        asset_id=job.asset_id,
        reply=job.reply,
        operation=job.operation,
        used_base=job.used_base,
        logo_applied=job.logo_applied,
        logo_note=job.logo_note,
        error=job.error,
    )


@router.post("/image", response_model=ImageJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def studio_image(
    body: ImageRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Queue a background image generation. Poll GET /studio/image/jobs/{id}."""
    job = await ImageJobService(db, user_id).create(
        "generate",
        body.prompt,
        {
            "size": body.size,
            "quality": body.quality.value,
            "style": body.style,
            "draft": body.draft,
            "input_image_url": body.input_image_url,
            "as_logo": body.as_logo,
            "save": body.save,
            "brand_logo": body.brand_logo,
        },
    )
    return _job_response(job)


@router.post("/image/chat", response_model=ImageJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def studio_image_chat(
    body: ImageChatRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Queue a background conversational image turn. Poll the job."""
    job = await ImageJobService(db, user_id).create(
        "chat",
        body.instruction.strip(),
        {
            "attachment_url": body.attachment_url,
            "previous_image_url": body.previous_image_url,
            "history": [{"role": t.role, "text": t.text} for t in body.history],
            "brand_logo": body.brand_logo,
        },
    )
    return _job_response(job)


@router.get("/image/jobs/{job_id}", response_model=ImageJobResponse)
async def studio_image_job(
    job_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return _job_response(await ImageJobService(db, user_id).get(job_id))


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


# --------------------------------------------------------------- brand kit
# Workspace-level brand logo + colours. The same fields power the AI Video
# watermark; here they're used to composite the logo onto generated images
# wherever the prompt asks for it.
@router.get("/brand", response_model=BrandKitResponse)
async def get_brand(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    u = await _owner(db, user_id)
    return BrandKitResponse(brand_logo_url=u.brand_logo_url, brand_colors=u.brand_colors)


@router.patch("/brand", response_model=BrandKitResponse)
async def set_brand(
    body: BrandKitUpdate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    u = await _owner(db, user_id)
    u.brand_logo_url = body.logo_url or None
    u.brand_colors = [c.strip() for c in body.colors if c.strip()][:6] or None
    await db.commit()
    return BrandKitResponse(brand_logo_url=u.brand_logo_url, brand_colors=u.brand_colors)


@router.delete("/brand", response_model=BrandKitResponse)
async def clear_brand(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    u = await _owner(db, user_id)
    u.brand_logo_url = None
    u.brand_colors = None
    await db.commit()
    return BrandKitResponse(brand_logo_url=None, brand_colors=None)
