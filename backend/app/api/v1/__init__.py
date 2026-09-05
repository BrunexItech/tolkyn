from fastapi import APIRouter, Depends

from app.core.actor import require_feature
from app.api.v1.endpoints import auth_router, leads_router, customers_router
from app.api.v1.endpoints.social_leads import router as social_leads_router
from app.api.v1.endpoints.email_accounts import router as email_accounts_router
from app.api.v1.endpoints.geo import router as geo_router
from app.api.v1.endpoints.media_intel import router as media_intel_router
from app.api.v1.endpoints.studio import router as studio_router
from app.api.v1.endpoints.social import router as social_router
from app.api.v1.endpoints.posts import router as posts_router
from app.api.v1.endpoints.uploads import router as uploads_router
from app.api.v1.endpoints.inbox import router as inbox_router
from app.api.v1.endpoints.analytics import router as analytics_router
from app.api.v1.endpoints.campaigns import router as campaigns_router
from app.api.v1.endpoints.audience import router as audience_router
from app.api.v1.endpoints.messaging import router as messaging_router, webhook_router as messaging_webhook_router
from app.api.v1.endpoints.phone_book import router as phone_book_router
from app.api.v1.endpoints.email_campaigns import router as email_campaigns_router
from app.api.v1.endpoints.automations import router as automations_router
from app.api.v1.endpoints.team import router as team_router
from app.api.v1.endpoints.call_center import router as call_center_router, webhook_router as call_center_webhook_router
from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.video import router as video_router


def _feat(*modules: str):
    return [Depends(require_feature(*modules))]


router = APIRouter()

# --- ungated: auth, connections, team, super-admin, account settings ---
router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
router.include_router(social_router, prefix="/accounts", tags=["Connected Accounts"])
router.include_router(team_router, prefix="/team", tags=["Team"])
router.include_router(email_accounts_router, prefix="/email-accounts", tags=["Email"])
router.include_router(admin_router, prefix="/admin", tags=["Super Admin"])

# --- webhooks (service-to-service, no user session) ---
router.include_router(messaging_webhook_router, prefix="/messaging", tags=["Messaging"])
router.include_router(call_center_webhook_router, prefix="/call-center", tags=["Call Center"])

# --- plan-gated: 403 unless the workspace's package grants the module ---
router.include_router(leads_router, prefix="/leads", tags=["Leads"], dependencies=_feat("leads"))
router.include_router(social_leads_router, prefix="/social-leads", tags=["Social Leads"], dependencies=_feat("leads"))
router.include_router(customers_router, prefix="/customers", tags=["CRM"], dependencies=_feat("crm"))
router.include_router(geo_router, prefix="/geo", tags=["Geo Targeting"], dependencies=_feat("geo"))
router.include_router(media_intel_router, prefix="/media-intel", tags=["Media Intelligence"], dependencies=_feat("analytics"))
router.include_router(studio_router, prefix="/studio", tags=["Content Studio"], dependencies=_feat("content_studio"))
router.include_router(posts_router, prefix="/posts", tags=["Composer"], dependencies=_feat("publishing"))
router.include_router(uploads_router, prefix="/uploads", tags=["Uploads"], dependencies=_feat("publishing"))
router.include_router(inbox_router, prefix="/inbox", tags=["Social Inbox"], dependencies=_feat("engage"))
router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"], dependencies=_feat("analytics"))
router.include_router(campaigns_router, prefix="/campaigns", tags=["Campaigns"], dependencies=_feat("campaigns"))
router.include_router(audience_router, prefix="/audience", tags=["Audience"], dependencies=_feat("audience"))
router.include_router(messaging_router, prefix="/messaging", tags=["Messaging"], dependencies=_feat("sms", "whatsapp"))
router.include_router(phone_book_router, prefix="/phone-books", tags=["Phone Book"], dependencies=_feat("sms", "whatsapp"))
router.include_router(email_campaigns_router, prefix="/email", tags=["Bulk Email"], dependencies=_feat("email"))
router.include_router(automations_router, prefix="/automations", tags=["Automations"], dependencies=_feat("automations"))
router.include_router(call_center_router, prefix="/call-center", tags=["Call Center"], dependencies=_feat("call_center"))
router.include_router(video_router, prefix="/video", tags=["Video Generation"], dependencies=_feat("video"))

__all__ = ["router"]
