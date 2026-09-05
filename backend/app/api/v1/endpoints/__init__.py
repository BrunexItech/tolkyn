from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.leads import router as leads_router
from app.api.v1.endpoints.customers import router as customers_router

__all__ = [
    "auth_router",
    "leads_router",
    "customers_router",
]
