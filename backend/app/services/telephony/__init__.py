from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telephony import TelephonyConfig
from app.services.telephony.asterisk import AsteriskProvider
from app.services.telephony.base import PlacedCall, SipCredentials, TelephonyError, TelephonyProvider
from app.services.telephony.cloudone import CloudOneProvider
from app.services.telephony.simulated import SimulatedProvider

__all__ = [
    "AsteriskProvider",
    "PlacedCall",
    "SipCredentials",
    "TelephonyError",
    "TelephonyProvider",
    "get_config",
    "get_provider",
]

_SIMULATED = SimulatedProvider()


async def get_config(db: AsyncSession, workspace_id: str) -> Optional[TelephonyConfig]:
    return (
        await db.execute(select(TelephonyConfig).where(TelephonyConfig.workspace_id == workspace_id))
    ).scalar_one_or_none()


async def get_provider(db: AsyncSession, workspace_id: str) -> TelephonyProvider:
    cfg = await get_config(db, workspace_id)
    if cfg and cfg.is_active:
        if cfg.provider == "asterisk":
            return AsteriskProvider(cfg)
        if cfg.provider == "cloudone":
            return CloudOneProvider(cfg)
    return _SIMULATED
