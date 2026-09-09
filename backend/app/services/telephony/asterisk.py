"""The self-hosted Asterisk PBX (in front of the Cloud One SIP trunk).

Tolkyn runs one Asterisk for all tenants. The trunk is a single shared Cloud
One account; each workspace is assigned a DID and each agent a SIP extension
(`call_agents.sip_extension` / `sip_password_enc`). The browser softphone
(SIP.js) registers straight to Asterisk over WebSocket and places / receives
calls itself — Asterisk's dialplan does the routing and caller-ID rules.

`place_call` / `hangup` / `transfer` are no-ops here for now: the POC dials
from the softphone directly. Server-side origination + CDR/events over
Asterisk ARI is the production phase.
"""
from __future__ import annotations

from typing import Optional

from app.core.config import settings
from app.core.crypto import decrypt
from app.services.telephony.base import PlacedCall, SipCredentials


class AsteriskProvider:
    name = "asterisk"

    def __init__(self, cfg) -> None:
        self.workspace_id = cfg.workspace_id
        # per-workspace overrides are allowed but default to the shared PBX
        self.sip_domain = cfg.sip_domain or settings.PBX_SIP_DOMAIN
        self.sip_ws_url = cfg.sip_ws_url or settings.PBX_WS_URL
        self.caller_id = cfg.outbound_caller_id  # the workspace's assigned DID

    # --- call control: the softphone handles this directly for now ---
    async def place_call(self, from_extension: str, to_number: str) -> PlacedCall:
        # not an error — the browser softphone places the call over SIP/WS.
        # The backend still records the Call row for history.
        return PlacedCall(channel_id=None, provider=self.name)

    async def hangup(self, channel_id: Optional[str]) -> None:
        return None

    async def transfer(self, channel_id: Optional[str], to_extension: str) -> None:
        return None

    # --- softphone registration details for this agent ---
    def sip_credentials(
        self, extension: Optional[str], password: Optional[str], display_name: str
    ) -> SipCredentials:
        if not (self.sip_ws_url and self.sip_domain and extension):
            return SipCredentials(configured=False)
        return SipCredentials(
            configured=True,
            ws_url=self.sip_ws_url,
            domain=self.sip_domain,
            extension=extension,
            password=decrypt(password) if password else None,
            display_name=display_name,
        )
