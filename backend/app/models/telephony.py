from sqlalchemy import Boolean, Column, String

from app.db.base import BaseModel


class TelephonyConfig(BaseModel):
    """Per-workspace phone-system settings, managed from the super-admin
    portal. `provider == "simulated"` (the default) keeps the current
    fake-call behaviour so the Call Center is usable before a trunk exists;
    `provider == "cloudone"` routes real calls through a CloudOne / Yeastar
    P-Series PBX. Adding a new client = one row here, no code changes."""

    __tablename__ = "telephony_configs"

    workspace_id = Column(String(36), nullable=False, unique=True, index=True)
    provider = Column(String(20), nullable=False, default="simulated")  # simulated | cloudone
    is_active = Column(Boolean, nullable=False, default=False)

    # Yeastar P-Series OpenAPI (server-side call control + CDR + events)
    pbx_base_url = Column(String(300), nullable=True)          # https://xxxx.ras.yeastar.com:8088
    api_client_id = Column(String(160), nullable=True)
    api_client_secret_enc = Column(String(600), nullable=True)

    # SIP-over-WebSocket, for the in-browser softphone (SIP.js)
    sip_domain = Column(String(200), nullable=True)            # xxxx.ras.yeastar.com
    sip_ws_url = Column(String(300), nullable=True)            # wss://xxxx.ras.yeastar.com:8089/ws

    outbound_caller_id = Column(String(40), nullable=True)     # a DID from the trunk
    record_calls = Column(Boolean, nullable=False, default=True)

    # Shared secret the PBX signs its event webhooks with (per workspace).
    webhook_secret = Column(String(80), nullable=True)
