from fastapi import APIRouter
from app.api.v1.endpoints import auth_router, leads_router

router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
router.include_router(leads_router, prefix="/leads", tags=["Leads"])

__all__ = ["router"]