from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.models.user import User
from app.schemas.video import (
    BrandUpdateRequest,
    EnhancePromptRequest,
    EnhancePromptResponse,
    VideoGenerateRequest,
    VideoJobList,
    VideoJobResponse,
    VideoModelsResponse,
)
from app.services.content_ai import enhance_video_prompt
from app.services.video_service import VideoService

router = APIRouter()


async def _load_user(db: AsyncSession, user_id: str) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/models", response_model=VideoModelsResponse)
async def video_models(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    user = await _load_user(db, user_id)
    return await VideoService(db, user).models_response()


@router.post("/enhance-prompt", response_model=EnhancePromptResponse)
async def enhance_prompt(
    body: EnhancePromptRequest,
    user_id: str = Depends(get_workspace_id),
):
    """Turns a short, plain-language idea into a well-formed Veo prompt."""
    prompt = await enhance_video_prompt(body.idea.strip(), brand_colors=body.brand_colors)
    return EnhancePromptResponse(prompt=prompt)


@router.patch("/brand", response_model=VideoModelsResponse)
async def set_brand(
    body: BrandUpdateRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Sets the persistent brand logo/colors — applied automatically to every
    generation from now on (color hints in the prompt + a corner watermark)."""
    user = await _load_user(db, user_id)
    service = VideoService(db, user)
    await service.set_brand(body)
    return await service.models_response()


@router.delete("/brand", response_model=VideoModelsResponse)
async def clear_brand(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    user = await _load_user(db, user_id)
    service = VideoService(db, user)
    await service.clear_brand()
    return await service.models_response()


@router.post("/generate", response_model=VideoJobResponse, status_code=status.HTTP_201_CREATED)
async def generate_video(
    body: VideoGenerateRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    user = await _load_user(db, user_id)
    job = await VideoService(db, user).create_job(body)
    return VideoJobResponse.model_validate(job)


@router.get("", response_model=VideoJobList)
async def list_videos(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    user = await _load_user(db, user_id)
    items = await VideoService(db, user).list_jobs()
    return VideoJobList(items=[VideoJobResponse.model_validate(j) for j in items])


@router.get("/{job_id}", response_model=VideoJobResponse)
async def get_video(
    job_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    user = await _load_user(db, user_id)
    job = await VideoService(db, user).get_job(job_id)
    return VideoJobResponse.model_validate(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    job_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    user = await _load_user(db, user_id)
    await VideoService(db, user).delete_job(job_id)
