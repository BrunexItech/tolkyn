from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.campaign import (
    AttachPostRequest,
    CampaignCreate,
    CampaignDetail,
    CampaignList,
    CampaignResponse,
    CampaignSummary,
    CampaignUpdate,
)
from app.services.campaign_service import CampaignService

router = APIRouter()


def _campaign_response(c, labels: dict) -> CampaignResponse:
    resp = CampaignResponse.model_validate(c)
    resp.target_area_labels = [labels[i] for i in (c.target_area_ids or []) if i in labels]
    return resp


def _post_row(p) -> dict:
    return {
        "id": p.id,
        "body": p.body,
        "status": p.status.value,
        "platforms": p.platforms,
        "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
        "published_at": p.published_at.isoformat() if p.published_at else None,
    }


@router.get("", response_model=CampaignList)
async def list_campaigns(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = CampaignService(db, user_id)
    items = await svc.list()
    labels = await svc.area_labels(items)
    return CampaignList(items=[_campaign_response(c, labels) for c in items])


@router.get("/summary", response_model=CampaignSummary)
async def campaign_summary(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return CampaignSummary(**await CampaignService(db, user_id).summary())


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CampaignCreate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = CampaignService(db, user_id)
    c = await svc.create(body.model_dump(mode="json"))
    labels = await svc.area_labels([c])
    return _campaign_response(c, labels)


@router.get("/{campaign_id}", response_model=CampaignDetail)
async def get_campaign(
    campaign_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = CampaignService(db, user_id)
    c = await svc.get(campaign_id)
    labels = await svc.area_labels([c])
    d = _campaign_response(c, labels).model_dump()
    d["metrics"] = await svc.metrics(campaign_id)
    d["posts"] = [_post_row(p) for p in await svc.posts(campaign_id)]
    return d


@router.patch("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = CampaignService(db, user_id)
    c = await svc.update(campaign_id, body.model_dump(mode="json", exclude_unset=True))
    labels = await svc.area_labels([c])
    return _campaign_response(c, labels)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await CampaignService(db, user_id).delete(campaign_id)


@router.post("/{campaign_id}/posts", status_code=status.HTTP_204_NO_CONTENT)
async def attach_post(
    campaign_id: str,
    body: AttachPostRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await CampaignService(db, user_id).attach_post(campaign_id, body.post_id, body.attach)
