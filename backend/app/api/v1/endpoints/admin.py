from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_security import get_current_super_admin_id
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.video_models import catalog_payload
from app.db import get_db
from app.schemas.admin import (
    AdminLoginRequest,
    AdminTokenResponse,
    ActivityLogList,
    ActivityLogRow,
    AnnouncementPreview,
    AnnouncementRow,
    ModuleInfo,
    SendAnnouncementRequest,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
    PackageCreate,
    PackageList,
    PackageResponse,
    PackageUpdate,
    PlatformOverview,
    PlatformUserList,
    PlatformUserResponse,
    PlatformUserUpdate,
    SubsidiaryCreate,
    SubsidiaryResponse,
    SubsidiaryUpdate,
    TelephonyConfigResponse,
    TelephonyConfigUpdate,
    UserUsageSummary,
    VideoUsageList,
    VideoUsageRow,
)
from app.schemas.video import VideoModelInfo
from app.services.super_admin_service import SuperAdminService

router = APIRouter()


def _org_response(org, owner_emails: dict) -> OrganizationResponse:
    resp = OrganizationResponse.model_validate(org)
    resp.owner_email = owner_emails.get(org.owner_user_id) if org.owner_user_id else None
    return resp


# ------------------------------------------------------------------- auth
@router.post("/auth/login", response_model=AdminTokenResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def admin_login(
    body: AdminLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await SuperAdminService(db).login(
        body.email, body.password, ip=request.client.host if request.client else None
    )
    return AdminTokenResponse(**result)


@router.get("/auth/me")
async def admin_me(
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    admin = await SuperAdminService(db).me(admin_id)
    return {"id": admin.id, "name": admin.name, "email": admin.email, "last_login_at": admin.last_login_at}


# --------------------------------------------------------------- overview
@router.get("/overview", response_model=PlatformOverview)
async def overview(
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return PlatformOverview(**await SuperAdminService(db).overview())


# ---------------------------------------------------------- organizations
@router.get("/organizations", response_model=list[OrganizationResponse])
async def list_organizations(
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    svc = SuperAdminService(db)
    items = await svc.list_organizations()
    emails = await svc.owner_emails(items)
    return [_org_response(o, emails) for o in items]


@router.post("/organizations", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    body: OrganizationCreate,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    svc = SuperAdminService(db)
    org = await svc.create_organization(admin_id, body.name, body.slug, body.notes, body.owner_user_id)
    emails = await svc.owner_emails([org])
    return _org_response(org, emails)


@router.patch("/organizations/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    body: OrganizationUpdate,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    svc = SuperAdminService(db)
    org = await svc.update_organization(org_id, body.model_dump(exclude_unset=True))
    emails = await svc.owner_emails([org])
    return _org_response(org, emails)


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: str,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    await SuperAdminService(db).delete_organization(org_id)


# ----------------------------------------------------------- subsidiaries
@router.post("/subsidiaries", response_model=SubsidiaryResponse, status_code=status.HTTP_201_CREATED)
async def create_subsidiary(
    body: SubsidiaryCreate,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    sub = await SuperAdminService(db).create_subsidiary(admin_id, body.model_dump())
    return SubsidiaryResponse.model_validate(sub)


@router.patch("/subsidiaries/{sub_id}", response_model=SubsidiaryResponse)
async def update_subsidiary(
    sub_id: str,
    body: SubsidiaryUpdate,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    sub = await SuperAdminService(db).update_subsidiary(sub_id, body.model_dump(exclude_unset=True))
    return SubsidiaryResponse.model_validate(sub)


@router.delete("/subsidiaries/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subsidiary(
    sub_id: str,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    await SuperAdminService(db).delete_subsidiary(sub_id)


def _user_resp(u) -> PlatformUserResponse:
    d = PlatformUserResponse.model_validate(u).model_dump()
    d["package_name"] = u.package.name if getattr(u, "package", None) else None
    return PlatformUserResponse(**d)


# --------------------------------------------------------------- packages
@router.get("/packages", response_model=PackageList)
async def list_packages(
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    svc = SuperAdminService(db)
    return PackageList(
        items=[PackageResponse(**p) for p in await svc.list_packages()],
        modules=[ModuleInfo(**m) for m in svc.module_catalog()],
    )


@router.post("/packages", response_model=PackageResponse, status_code=status.HTTP_201_CREATED)
async def create_package(
    body: PackageCreate,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    pkg = await SuperAdminService(db).create_package(body.model_dump())
    return PackageResponse.model_validate(pkg)


@router.patch("/packages/{pkg_id}", response_model=PackageResponse)
async def update_package(
    pkg_id: str,
    body: PackageUpdate,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    pkg = await SuperAdminService(db).update_package(pkg_id, body.model_dump(exclude_unset=True))
    return PackageResponse.model_validate(pkg)


@router.delete("/packages/{pkg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_package(
    pkg_id: str,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    await SuperAdminService(db).delete_package(pkg_id)


# --------------------------------------------------------------- telephony
@router.get("/telephony/{workspace_id}", response_model=TelephonyConfigResponse)
async def get_telephony(
    workspace_id: str,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return TelephonyConfigResponse(**await SuperAdminService(db).get_telephony(workspace_id))


@router.put("/telephony/{workspace_id}", response_model=TelephonyConfigResponse)
async def update_telephony(
    workspace_id: str,
    body: TelephonyConfigUpdate,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return TelephonyConfigResponse(
        **await SuperAdminService(db).update_telephony(workspace_id, body.model_dump(exclude_unset=True))
    )


# ---------------------------------------------------------- announcements
@router.post("/announcements/preview", response_model=AnnouncementPreview)
async def preview_announcement(
    body: SendAnnouncementRequest,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return AnnouncementPreview(
        **await SuperAdminService(db).preview_announcement(body.audience.model_dump(exclude_none=True))
    )


@router.post("/announcements", response_model=AnnouncementRow)
async def send_announcement(
    body: SendAnnouncementRequest,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return AnnouncementRow(
        **await SuperAdminService(db).send_announcement(
            admin_id, body.subject, body.body, body.audience.model_dump(exclude_none=True)
        )
    )


@router.get("/announcements", response_model=list[AnnouncementRow])
async def list_announcements(
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return [AnnouncementRow(**r) for r in await SuperAdminService(db).list_announcements()]


# ------------------------------------------------------------------ users
@router.get("/users", response_model=PlatformUserList)
async def list_users(
    search: str = Query("", max_length=120),
    role: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    approval: Optional[str] = Query(None, description="'pending' or 'approved'"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    items, total = await SuperAdminService(db).list_users(
        search=search, role=role, status_filter=status_filter, approval_filter=approval, limit=limit, offset=offset
    )
    return PlatformUserList(
        items=[_user_resp(u) for u in items], total=total, limit=limit, offset=offset
    )


@router.get("/users/{user_id}", response_model=PlatformUserResponse)
async def get_user(
    user_id: str,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return _user_resp(await SuperAdminService(db).get_user(user_id))


@router.patch("/users/{user_id}", response_model=PlatformUserResponse)
async def update_user(
    user_id: str,
    body: PlatformUserUpdate,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    svc = SuperAdminService(db)
    await svc.update_user(user_id, body.model_dump(exclude_unset=True))
    return _user_resp(await svc.get_user(user_id))


@router.post("/users/{user_id}/approve", response_model=PlatformUserResponse)
async def approve_user(
    user_id: str,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    """Allow a newly registered account into the main app — sets it approved
    and active in one action."""
    svc = SuperAdminService(db)
    await svc.approve_user(user_id)
    return _user_resp(await svc.get_user(user_id))


@router.get("/users/{user_id}/usage", response_model=UserUsageSummary)
async def user_usage(
    user_id: str,
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return UserUsageSummary(**await SuperAdminService(db).user_usage(user_id))


# --------------------------------------------------------------- activity
@router.get("/activity", response_model=ActivityLogList)
async def list_activity(
    user_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    items, total = await SuperAdminService(db).list_activity(
        user_id=user_id, workspace_id=workspace_id, action=action, limit=limit, offset=offset
    )
    return ActivityLogList(
        items=[ActivityLogRow.model_validate(r) for r in items], total=total, limit=limit, offset=offset
    )


# ---------------------------------------------------------- video usage
@router.get("/video-models", response_model=list[VideoModelInfo])
async def video_model_catalog(admin_id: str = Depends(get_current_super_admin_id)):
    """The Veo model catalog, for the model-access checkboxes in Users & Rights."""
    return [VideoModelInfo(**m) for m in catalog_payload()]


@router.get("/video-usage", response_model=VideoUsageList)
async def video_usage(
    admin_id: str = Depends(get_current_super_admin_id),
    db: AsyncSession = Depends(get_db),
):
    rows = await SuperAdminService(db).video_usage_overview()
    return VideoUsageList(items=[VideoUsageRow(**r) for r in rows])
