"""Platform control room — everything a super admin can do, all outside the
per-workspace tenant isolation the rest of the app enforces. Every method
here is deliberately unscoped (no `workspace_id == caller` filter) because
its whole purpose is to see and manage across every tenant."""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_security import create_admin_token
from app.core.security import verify_password
from app.models.activity_log import ActivityLog
from app.models.automation import Automation
from app.models.broadcast import Broadcast
from app.models.customer import Customer
from app.models.lead import Lead
import secrets as _secrets

from app.core.config import settings as _settings
from app.core.crypto import encrypt as _encrypt
from app.core.features import MODULES, normalize_modules
from app.models.telephony import TelephonyConfig
from app.models.organization import (
    Organization,
    OrganizationStatus,
    Subsidiary,
    SubsidiaryStatus,
)
from app.models.package import Package
from app.models.post import Post, PostStatus
from app.models.social_connection import ConnectionStatus, SocialConnection
from app.models.super_admin import SuperAdmin
from app.models.user import User, UserRole, UserStatus
from app.models.video_job import VideoJob, VideoJobStatus


class SuperAdminService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------- auth
    async def login(self, email: str, password: str, ip: Optional[str] = None) -> Dict[str, Any]:
        res = await self.db.execute(select(SuperAdmin).where(SuperAdmin.email == email))
        admin = res.scalar_one_or_none()
        if not admin or not verify_password(password, admin.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
        admin.last_login_at = datetime.now(timezone.utc)
        admin.last_login_ip = ip
        await self.db.commit()
        await self.db.refresh(admin)
        token = create_admin_token(admin.id)
        from app.core.config import settings

        return {
            "admin": admin,
            "access_token": token,
            "expires_in": settings.SUPER_ADMIN_TOKEN_EXPIRE_MINUTES * 60,
        }

    async def me(self, admin_id: str) -> SuperAdmin:
        res = await self.db.execute(select(SuperAdmin).where(SuperAdmin.id == admin_id))
        admin = res.scalar_one_or_none()
        if not admin:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Admin session no longer valid")
        return admin

    # ------------------------------------------------------ organizations
    async def list_organizations(self) -> List[Organization]:
        res = await self.db.execute(select(Organization).order_by(Organization.created_at.desc()))
        return list(res.scalars().all())

    async def create_organization(
        self, admin_id: str, name: str, slug: str, notes: Optional[str], owner_user_id: Optional[str] = None
    ) -> Organization:
        if owner_user_id:
            await self._require_approved_user(owner_user_id)
        org = Organization(name=name, slug=slug.lower(), notes=notes, created_by=admin_id, owner_user_id=owner_user_id or None)
        self.db.add(org)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, f"Slug '{slug}' is already in use")
        await self.db.refresh(org)
        return org

    async def update_organization(self, org_id: str, patch: Dict[str, Any]) -> Organization:
        org = await self._get_org(org_id)
        if "name" in patch and patch["name"] is not None:
            org.name = patch["name"]
        if "notes" in patch and patch["notes"] is not None:
            org.notes = patch["notes"]
        if patch.get("status"):
            org.status = OrganizationStatus(patch["status"])
        if "owner_user_id" in patch:
            owner_user_id = patch["owner_user_id"] or None
            if owner_user_id:
                await self._require_approved_user(owner_user_id)
            org.owner_user_id = owner_user_id
        await self.db.commit()
        await self.db.refresh(org)
        return org

    async def _require_approved_user(self, user_id: str) -> User:
        """A user that's real (exists), approved by the super admin, and
        active — the bar for being a Subsidiary's or Organization's main
        account. Raises 400/404 otherwise."""
        user = await self.get_user(user_id)
        if not user.is_approved or user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "That account isn't approved and active yet — approve it in Users & Rights first.",
            )
        return user

    async def delete_organization(self, org_id: str) -> None:
        org = await self._get_org(org_id)
        await self.db.delete(org)
        await self.db.commit()

    async def owner_emails(self, orgs: List[Organization]) -> Dict[str, str]:
        """org.owner_user_id -> that user's email, for display."""
        ids = {o.owner_user_id for o in orgs if o.owner_user_id}
        if not ids:
            return {}
        rows = (await self.db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
        return {u.id: u.email for u in rows}

    async def _get_org(self, org_id: str) -> Organization:
        res = await self.db.execute(select(Organization).where(Organization.id == org_id))
        org = res.scalar_one_or_none()
        if not org:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
        return org

    # -------------------------------------------------------- subsidiaries
    async def create_subsidiary(self, admin_id: str, data: Dict[str, Any]) -> Subsidiary:
        org = await self._get_org(data["organization_id"])  # 404s if missing
        if not org.owner_user_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "This organization has no main account yet — link an approved user to it before adding subdomains.",
            )
        # The organization's own owner might since have been suspended/unapproved.
        await self._require_approved_user(org.owner_user_id)
        # The subdomain itself must also point at a real, approved account —
        # what it shows when visited is that account's real activity.
        workspace_id = data.get("workspace_id") or None
        if not workspace_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick the account this subdomain belongs to.")
        await self._require_approved_user(workspace_id)

        sub = Subsidiary(
            organization_id=data["organization_id"],
            name=data["name"],
            subdomain=data["subdomain"].lower(),
            workspace_id=workspace_id,
            notes=data.get("notes"),
            created_by=admin_id,
        )
        self.db.add(sub)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, f"Subdomain '{data['subdomain']}' is already taken")
        await self.db.refresh(sub)
        return sub

    async def update_subsidiary(self, sub_id: str, patch: Dict[str, Any]) -> Subsidiary:
        sub = await self._get_sub(sub_id)
        if "name" in patch and patch["name"] is not None:
            sub.name = patch["name"]
        if "notes" in patch and patch["notes"] is not None:
            sub.notes = patch["notes"]
        if "workspace_id" in patch and patch["workspace_id"]:
            await self._require_approved_user(patch["workspace_id"])
            sub.workspace_id = patch["workspace_id"]
        if patch.get("status"):
            sub.status = SubsidiaryStatus(patch["status"])
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def delete_subsidiary(self, sub_id: str) -> None:
        sub = await self._get_sub(sub_id)
        await self.db.delete(sub)
        await self.db.commit()

    async def _get_sub(self, sub_id: str) -> Subsidiary:
        res = await self.db.execute(select(Subsidiary).where(Subsidiary.id == sub_id))
        sub = res.scalar_one_or_none()
        if not sub:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Subsidiary not found")
        return sub

    # -------------------------------------------------------------- users
    async def list_users(
        self,
        *,
        search: str = "",
        role: Optional[str] = None,
        status_filter: Optional[str] = None,
        approval_filter: Optional[str] = None,  # "pending" | "approved" | None
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[List[User], int]:
        base = select(User).where(User.is_deleted.is_(False))
        count_q = select(func.count()).select_from(User).where(User.is_deleted.is_(False))

        def apply(q):
            if role:
                q = q.where(User.role == role)
            if status_filter:
                q = q.where(User.status == status_filter)
            if approval_filter == "pending":
                q = q.where(User.is_approved.is_(False))
            elif approval_filter == "approved":
                q = q.where(User.is_approved.is_(True))
            if search:
                like = f"%{search}%"
                q = q.where(or_(User.name.ilike(like), User.email.ilike(like)))
            return q

        rows = (
            await self.db.execute(apply(base).order_by(User.created_at.desc()).limit(limit).offset(offset))
        ).scalars().all()
        total = (await self.db.execute(apply(count_q))).scalar() or 0
        return list(rows), total

    async def get_user(self, user_id: str) -> User:
        res = await self.db.execute(select(User).where(User.id == user_id))
        user = res.scalar_one_or_none()
        if not user:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        return user

    async def update_user(self, user_id: str, patch: Dict[str, Any]) -> User:
        """`patch` is a partial dict (exclude_unset) — only keys that were
        actually sent get applied, so e.g. clearing video_budget_usd to null
        is distinguishable from not touching it at all."""
        user = await self.get_user(user_id)
        if patch.get("role"):
            user.role = UserRole(patch["role"])
        if patch.get("status"):
            user.status = UserStatus(patch["status"])
        if patch.get("is_approved") is not None:
            user.is_approved = patch["is_approved"]
        if "allowed_video_models" in patch:
            user.allowed_video_models = patch["allowed_video_models"] or []
        if "video_budget_usd" in patch:
            user.video_budget_usd = patch["video_budget_usd"]
        if "package_id" in patch:
            pid = patch["package_id"] or None
            if pid:
                exists = (await self.db.execute(select(Package.id).where(Package.id == pid))).scalar_one_or_none()
                if not exists:
                    raise HTTPException(status.HTTP_404_NOT_FOUND, "Package not found")
            user.package_id = pid
        await self.db.commit()
        await self.db.refresh(user)
        return user

    # ---------------------------------------------------------- packages
    async def list_packages(self) -> List[Dict[str, Any]]:
        rows = (
            await self.db.execute(select(Package).order_by(Package.sort_order, Package.created_at))
        ).scalars().all()
        # member counts in one query
        counts = dict(
            (
                await self.db.execute(
                    select(User.package_id, func.count())
                    .where(User.package_id.isnot(None), User.is_deleted.is_(False))
                    .group_by(User.package_id)
                )
            ).all()
        )
        out = []
        for p in rows:
            d = {c.name: getattr(p, c.name) for c in Package.__table__.columns}
            d["member_count"] = counts.get(p.id, 0)
            out.append(d)
        return out

    @staticmethod
    def module_catalog() -> List[Dict[str, str]]:
        return [{"key": k, "label": v} for k, v in MODULES.items()]

    async def create_package(self, data: Dict[str, Any]) -> Package:
        name = (data.get("name") or "").strip()
        dup = (await self.db.execute(select(Package).where(func.lower(Package.name) == name.lower()))).scalar_one_or_none()
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, f'A package called "{name}" already exists')
        pkg = Package(
            name=name,
            description=(data.get("description") or "").strip() or None,
            price_amount=data.get("price_amount") or 0,
            price_currency=(data.get("price_currency") or "KES").upper(),
            price_interval=data.get("price_interval") or "month",
            modules=normalize_modules(data.get("modules")),
            limits=data.get("limits") or {},
            is_active=data.get("is_active", True),
            is_default=data.get("is_default", False),
            sort_order=data.get("sort_order") or 0,
        )
        self.db.add(pkg)
        if pkg.is_default:
            await self._clear_other_defaults(exclude_id=None)
        await self.db.commit()
        await self.db.refresh(pkg)
        return pkg

    async def update_package(self, pkg_id: str, patch: Dict[str, Any]) -> Package:
        pkg = (await self.db.execute(select(Package).where(Package.id == pkg_id))).scalar_one_or_none()
        if not pkg:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Package not found")
        if "name" in patch and patch["name"]:
            pkg.name = patch["name"].strip()
        if "description" in patch:
            pkg.description = (patch["description"] or "").strip() or None
        for k in ("price_amount", "price_currency", "price_interval", "is_active", "sort_order"):
            if k in patch and patch[k] is not None:
                setattr(pkg, k, patch[k])
        if "modules" in patch and patch["modules"] is not None:
            pkg.modules = normalize_modules(patch["modules"])
        if "limits" in patch and patch["limits"] is not None:
            pkg.limits = patch["limits"]
        if patch.get("is_default"):
            pkg.is_default = True
            await self._clear_other_defaults(exclude_id=pkg.id)
        elif "is_default" in patch and patch["is_default"] is False:
            pkg.is_default = False
        await self.db.commit()
        await self.db.refresh(pkg)
        return pkg

    async def delete_package(self, pkg_id: str) -> None:
        pkg = (await self.db.execute(select(Package).where(Package.id == pkg_id))).scalar_one_or_none()
        if not pkg:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Package not found")
        assigned = (
            await self.db.execute(select(func.count()).select_from(User).where(User.package_id == pkg_id))
        ).scalar() or 0
        if assigned:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{assigned} user(s) are on this package — reassign them first.",
            )
        await self.db.delete(pkg)
        await self.db.commit()

    async def _clear_other_defaults(self, exclude_id: Optional[str]) -> None:
        q = select(Package).where(Package.is_default.is_(True))
        if exclude_id:
            q = q.where(Package.id != exclude_id)
        for other in (await self.db.execute(q)).scalars().all():
            other.is_default = False

    # -------------------------------------------------------- telephony
    async def get_telephony(self, workspace_id: str) -> Dict[str, Any]:
        cfg = (
            await self.db.execute(select(TelephonyConfig).where(TelephonyConfig.workspace_id == workspace_id))
        ).scalar_one_or_none()
        base = (_settings.BACKEND_PUBLIC_URL or "").rstrip("/")
        webhook_url = f"{base}{_settings.API_V1_PREFIX}/call-center/webhook/{workspace_id}/event"
        if not cfg:
            return {
                "workspace_id": workspace_id, "provider": "simulated", "is_active": False,
                "api_client_secret_set": False, "record_calls": True, "webhook_url": webhook_url,
            }
        return {
            "workspace_id": workspace_id,
            "provider": cfg.provider,
            "is_active": cfg.is_active,
            "pbx_base_url": cfg.pbx_base_url,
            "api_client_id": cfg.api_client_id,
            "api_client_secret_set": bool(cfg.api_client_secret_enc),
            "sip_domain": cfg.sip_domain,
            "sip_ws_url": cfg.sip_ws_url,
            "outbound_caller_id": cfg.outbound_caller_id,
            "record_calls": cfg.record_calls,
            "webhook_secret": cfg.webhook_secret,
            "webhook_url": webhook_url,
        }

    async def update_telephony(self, workspace_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        # the workspace must be a real user
        exists = (await self.db.execute(select(User.id).where(User.id == workspace_id))).scalar_one_or_none()
        if not exists:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace (user) not found")
        cfg = (
            await self.db.execute(select(TelephonyConfig).where(TelephonyConfig.workspace_id == workspace_id))
        ).scalar_one_or_none()
        if not cfg:
            cfg = TelephonyConfig(workspace_id=workspace_id, webhook_secret=_secrets.token_hex(24))
            self.db.add(cfg)
        for k in ("provider", "is_active", "pbx_base_url", "api_client_id", "sip_domain",
                  "sip_ws_url", "outbound_caller_id", "record_calls"):
            if k in patch and patch[k] is not None:
                setattr(cfg, k, patch[k])
        if "api_client_secret" in patch:
            v = patch["api_client_secret"]
            cfg.api_client_secret_enc = _encrypt(v) if v else None
        if not cfg.webhook_secret:
            cfg.webhook_secret = _secrets.token_hex(24)
        await self.db.commit()
        return await self.get_telephony(workspace_id)

    async def approve_user(self, user_id: str) -> User:
        """One-click 'allow' — the super admin grants a newly registered
        account dashboard access. Also (re)activates it, since an approval
        action is a clear signal the account should be usable now."""
        user = await self.get_user(user_id)
        user.is_approved = True
        if user.status != UserStatus.SUSPENDED:
            user.status = UserStatus.ACTIVE
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def user_usage(self, user_id: str) -> Dict[str, Any]:
        user = await self.get_user(user_id)
        workspace_id = user_id  # workspace_id == user_id everywhere in this app

        async def count(model, *clauses) -> int:
            q = select(func.count()).select_from(model).where(model.workspace_id == workspace_id, *clauses)
            return (await self.db.execute(q)).scalar() or 0

        video_row = (
            await self.db.execute(
                select(
                    func.count(VideoJob.id),
                    func.coalesce(func.sum(VideoJob.duration_seconds).filter(VideoJob.status == VideoJobStatus.SUCCEEDED), 0),
                    func.coalesce(func.sum(VideoJob.cost_usd).filter(VideoJob.status != VideoJobStatus.FAILED), 0.0),
                ).where(VideoJob.workspace_id == workspace_id)
            )
        ).first()

        return {
            "user_id": user_id,
            "leads": await count(Lead),
            "customers": await count(Customer),
            "posts_published": await count(Post, Post.status == PostStatus.PUBLISHED),
            "broadcasts_sent": await count(Broadcast),
            "automations": await count(Automation),
            "connected_accounts": await count(SocialConnection, SocialConnection.status == ConnectionStatus.CONNECTED),
            "video_jobs": video_row[0] or 0,
            "video_seconds_generated": video_row[1] or 0,
            "video_spend_usd": float(video_row[2] or 0.0),
            "last_login_at": user.last_login_at,
            "member_since": user.created_at,
        }

    # --------------------------------------------------- announcements
    async def _announcement_audience(self, filt: Dict[str, Any]) -> tuple[List[User], str]:
        q = select(User).where(User.is_deleted.is_(False))
        bits: List[str] = []
        if filt.get("user_ids"):
            q = q.where(User.id.in_(filt["user_ids"]))
            bits.append(f"{len(filt['user_ids'])} selected")
        if filt.get("package_id"):
            q = q.where(User.package_id == filt["package_id"])
            bits.append("on a package")
        if filt.get("status"):
            q = q.where(User.status == filt["status"])
            bits.append(str(filt["status"]))
        if filt.get("approval") == "approved":
            q = q.where(User.is_approved.is_(True))
            bits.append("approved")
        elif filt.get("approval") == "pending":
            q = q.where(User.is_approved.is_(False))
            bits.append("pending approval")
        if filt.get("verified") is True:
            q = q.where(User.is_email_verified.is_(True))
            bits.append("verified email")
        rows = list((await self.db.execute(q)).scalars().all())
        return rows, ("All users" if not bits else " · ".join(bits))

    async def preview_announcement(self, filt: Dict[str, Any]) -> Dict[str, Any]:
        rows, summary = await self._announcement_audience(filt)
        return {"count": len(rows), "audience": summary, "sample": [u.email for u in rows[:10]]}

    async def send_announcement(
        self, admin_id: str, subject: str, body: str, filt: Dict[str, Any]
    ) -> Dict[str, Any]:
        from app.models.email_campaign import PlatformAnnouncement
        from app.services import platform_mailer

        if not platform_mailer.is_configured():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Platform email is not configured on the server.")
        rows, summary = await self._announcement_audience(filt)
        if not rows:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That filter matches no users.")

        recipients = [(u.email, {"name": (u.name or "there").split(" ")[0]}) for u in rows]
        result = await platform_mailer.send_bulk_branded(
            recipients,
            subject,
            heading=subject,
            body_template=body,
        )
        rec = PlatformAnnouncement(
            subject=subject[:500],
            body=body,
            audience=summary[:400],
            total=result["total"],
            sent=result["sent"],
            failed=result["failed"],
            sent_by=admin_id,
        )
        self.db.add(rec)
        await self.db.commit()
        await self.db.refresh(rec)
        return {
            "id": rec.id,
            "subject": rec.subject,
            "audience": rec.audience,
            "total": rec.total,
            "sent": rec.sent,
            "failed": rec.failed,
            "created_at": rec.created_at,
            "errors": result.get("errors", []),
        }

    async def list_announcements(self, limit: int = 50) -> List[Dict[str, Any]]:
        from app.models.email_campaign import PlatformAnnouncement

        rows = (
            await self.db.execute(
                select(PlatformAnnouncement).order_by(PlatformAnnouncement.created_at.desc()).limit(limit)
            )
        ).scalars()
        return [
            {
                "id": r.id,
                "subject": r.subject,
                "audience": r.audience,
                "total": r.total,
                "sent": r.sent,
                "failed": r.failed,
                "created_at": r.created_at,
            }
            for r in rows
        ]

    # ------------------------------------------------------- video usage
    async def video_usage_overview(self) -> List[Dict[str, Any]]:
        """Per-user video spend/usage, for the platform-wide governance view."""
        rows = (
            await self.db.execute(
                select(
                    VideoJob.workspace_id,
                    func.count(VideoJob.id),
                    func.coalesce(func.sum(VideoJob.duration_seconds).filter(VideoJob.status == VideoJobStatus.SUCCEEDED), 0),
                    func.coalesce(func.sum(VideoJob.cost_usd).filter(VideoJob.status != VideoJobStatus.FAILED), 0.0),
                )
                .group_by(VideoJob.workspace_id)
                .order_by(func.sum(VideoJob.cost_usd).desc())
            )
        ).all()
        if not rows:
            return []

        user_ids = [r[0] for r in rows]
        users = {
            u.id: u
            for u in (await self.db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        }

        out = []
        for workspace_id, jobs_count, seconds, spend in rows:
            user = users.get(workspace_id)
            out.append(
                {
                    "user_id": workspace_id,
                    "name": user.name if user else "(deleted account)",
                    "email": user.email if user else "—",
                    "jobs_count": jobs_count or 0,
                    "seconds_generated": seconds or 0,
                    "spend_usd": float(spend or 0.0),
                    "budget_usd": user.video_budget_usd if user else None,
                    "allowed_video_models": (user.allowed_video_models or []) if user else [],
                }
            )
        return out

    # ----------------------------------------------------------- activity
    async def list_activity(
        self,
        *,
        user_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        action: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[List[Dict[str, Any]], int]:
        base = select(ActivityLog)
        count_q = select(func.count()).select_from(ActivityLog)

        def apply(q):
            if user_id:
                q = q.where(ActivityLog.user_id == user_id)
            if workspace_id:
                q = q.where(ActivityLog.workspace_id == workspace_id)
            if action:
                q = q.where(ActivityLog.action == action)
            return q

        rows = (
            await self.db.execute(
                apply(base).order_by(ActivityLog.created_at.desc()).limit(limit).offset(offset)
            )
        ).scalars().all()
        total = (await self.db.execute(apply(count_q))).scalar() or 0

        # attach the user's email for readability, one query for every distinct user
        user_ids = {r.user_id for r in rows if r.user_id}
        emails: Dict[str, str] = {}
        if user_ids:
            for u in (await self.db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all():
                emails[u.id] = u.email

        out = []
        for r in rows:
            out.append(
                {
                    "id": r.id,
                    "user_id": r.user_id,
                    "user_email": emails.get(r.user_id) if r.user_id else None,
                    "workspace_id": r.workspace_id,
                    "method": r.method,
                    "path": r.path,
                    "action": r.action,
                    "detail": r.detail,
                    "status_code": r.status_code,
                    "duration_ms": r.duration_ms,
                    "ip_address": r.ip_address,
                    "created_at": r.created_at,
                }
            )
        return out, total

    # ----------------------------------------------------------- overview
    async def overview(self) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        orgs = (await self.db.execute(select(func.count()).select_from(Organization))).scalar() or 0
        subs = (await self.db.execute(select(func.count()).select_from(Subsidiary))).scalar() or 0
        users = (
            await self.db.execute(select(func.count()).select_from(User).where(User.is_deleted.is_(False)))
        ).scalar() or 0
        active_7d = (
            await self.db.execute(
                select(func.count()).select_from(User).where(User.last_login_at >= week_ago)
            )
        ).scalar() or 0
        req_today = (
            await self.db.execute(
                select(func.count()).select_from(ActivityLog).where(ActivityLog.created_at >= today_start)
            )
        ).scalar() or 0
        req_7d = (
            await self.db.execute(
                select(func.count()).select_from(ActivityLog).where(ActivityLog.created_at >= week_ago)
            )
        ).scalar() or 0
        video_jobs_total = (await self.db.execute(select(func.count()).select_from(VideoJob))).scalar() or 0
        video_spend_total = (
            await self.db.execute(
                select(func.coalesce(func.sum(VideoJob.cost_usd), 0.0)).where(VideoJob.status != VideoJobStatus.FAILED)
            )
        ).scalar() or 0.0

        return {
            "organizations": orgs,
            "subsidiaries": subs,
            "users": users,
            "active_users_7d": active_7d,
            "requests_today": req_today,
            "requests_7d": req_7d,
            "video_jobs_total": video_jobs_total,
            "video_spend_usd_total": float(video_spend_total),
        }
