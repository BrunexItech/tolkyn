from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.automation import (
    AutomationCreate,
    AutomationList,
    AutomationResponse,
    AutomationRunList,
    AutomationRunResponse,
    AutomationSummary,
    AutomationUpdate,
    ToggleRequest,
)
from app.services.automation_service import AutomationService

router = APIRouter()


@router.get("", response_model=AutomationList)
async def list_automations(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    items = await AutomationService(db, user_id).list()
    return AutomationList(items=[AutomationResponse.model_validate(a) for a in items])


@router.get("/summary", response_model=AutomationSummary)
async def automation_summary(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return AutomationSummary(**await AutomationService(db, user_id).summary())


@router.post("", response_model=AutomationResponse, status_code=status.HTTP_201_CREATED)
async def create_automation(
    body: AutomationCreate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    a = await AutomationService(db, user_id).create(body.model_dump(mode="json"))
    return AutomationResponse.model_validate(a)


@router.patch("/{aid}", response_model=AutomationResponse)
async def update_automation(
    aid: str,
    body: AutomationUpdate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    a = await AutomationService(db, user_id).update(aid, body.model_dump(mode="json", exclude_unset=True))
    return AutomationResponse.model_validate(a)


@router.post("/{aid}/toggle", response_model=AutomationResponse)
async def toggle_automation(
    aid: str,
    body: ToggleRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    a = await AutomationService(db, user_id).toggle(aid, body.enabled)
    return AutomationResponse.model_validate(a)


@router.post("/{aid}/test", response_model=AutomationRunResponse)
async def test_automation(
    aid: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return AutomationRunResponse.model_validate(await AutomationService(db, user_id).test_run(aid))


@router.get("/{aid}/runs", response_model=AutomationRunList)
async def automation_runs(
    aid: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    runs = await AutomationService(db, user_id).runs(aid)
    return AutomationRunList(items=[AutomationRunResponse.model_validate(r) for r in runs])


@router.delete("/{aid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation(
    aid: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await AutomationService(db, user_id).delete(aid)
