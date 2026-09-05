from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.social import (
    ConnectionList,
    ConnectionResponse,
    ConnectRequest,
    ConnectStartResponse,
    HostedConnectResponse,
)
from app.services.social_service import SocialService
from app.services.upload_post_client import CONNECTABLE_PLATFORMS, upload_post

router = APIRouter()


def _row(c) -> ConnectionResponse:
    return ConnectionResponse(
        id=c.id,
        platform=c.platform,
        status=c.status.value,
        handle=c.handle,
        display_name=c.display_name,
        avatar_url=getattr(c, "avatar_url", None),
        followers=c.followers,
        scopes=c.scopes or [],
        needs_reauth=c.status.value == "error",
        connected_at=c.connected_at,
        last_synced_at=c.last_synced_at,
        last_error=c.last_error,
        workspace_id=c.workspace_id,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def _list_payload(items) -> ConnectionList:
    valid = set(CONNECTABLE_PLATFORMS)
    rows = [c for c in items if c.platform in valid]
    return ConnectionList(
        items=[_row(c) for c in rows],
        connected=[c.platform for c in rows if c.status.value == "connected"],
        configured=upload_post.enabled,
    )


@router.get("", response_model=ConnectionList)
async def list_connections(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    items = await SocialService(db, user_id).list()
    return _list_payload(items)


@router.post("/sync", response_model=ConnectionList)
async def sync_connections(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = SocialService(db, user_id)
    await svc.sync(force=True)
    await svc.refresh_stats()
    return _list_payload(await svc.list(_skip_sync=True))


@router.post("/connect", response_model=ConnectStartResponse)
async def connect(
    body: ConnectRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return ConnectStartResponse(**await SocialService(db, user_id).start_connect(body.platform))


@router.get("/connect-page", response_model=HostedConnectResponse)
async def connect_page(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return HostedConnectResponse(**await SocialService(db, user_id).hosted_connect_url())


@router.delete("/{platform}", response_model=HostedConnectResponse)
async def disconnect(
    platform: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return HostedConnectResponse(**await SocialService(db, user_id).disconnect(platform))
