"""CloudOne SIP trunk = a Yeastar P-Series Cloud PBX. This talks to its
OpenAPI (https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/)
for server-side call control, and hands the browser SIP-over-WebSocket
credentials so SIP.js can carry the audio.

Needs live credentials (Client ID / Secret from the PBX portal) to actually
place calls — until then `get_provider()` falls back to the simulated one.
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

import httpx

from app.core.crypto import decrypt
from app.services.telephony.base import PlacedCall, SipCredentials, TelephonyError

_API_PATH = "/openapi/v1.0"
_UA = "TolkynCallCentre/1.0"  # Yeastar requires a User-Agent on every request

# workspace_id -> {"access_token", "exp", "refresh_token"}
_token_cache: Dict[str, Dict[str, Any]] = {}


class CloudOneProvider:
    name = "cloudone"

    def __init__(self, cfg) -> None:
        self.workspace_id = cfg.workspace_id
        self.base_url = (cfg.pbx_base_url or "").rstrip("/")
        self.client_id = cfg.api_client_id or ""
        self.client_secret = decrypt(cfg.api_client_secret_enc) if cfg.api_client_secret_enc else ""
        self.sip_domain = cfg.sip_domain
        self.sip_ws_url = cfg.sip_ws_url
        self.caller_id = cfg.outbound_caller_id

    # --------------------------------------------------------------- auth
    async def _token(self) -> str:
        cached = _token_cache.get(self.workspace_id)
        if cached and cached["exp"] > time.time() + 30:
            return cached["access_token"]

        if not (self.base_url and self.client_id and self.client_secret):
            raise TelephonyError("CloudOne is not fully configured for this workspace.")

        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": _UA}) as c:
            try:
                r = await c.post(
                    f"{self.base_url}{_API_PATH}/get_token",
                    json={"username": self.client_id, "password": self.client_secret},
                )
            except httpx.HTTPError as exc:
                raise TelephonyError(f"Can't reach the PBX: {exc}") from exc
        data = r.json() if r.text else {}
        if data.get("errcode") not in (0, None) or not data.get("access_token"):
            raise TelephonyError(data.get("errmsg") or "PBX rejected the API credentials")
        _token_cache[self.workspace_id] = {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "exp": time.time() + int(data.get("access_token_expire_time") or 1800),
        }
        return data["access_token"]

    async def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        token = await self._token()
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": _UA}) as c:
            try:
                r = await c.post(f"{self.base_url}{_API_PATH}{path}?access_token={token}", json=body)
            except httpx.HTTPError as exc:
                raise TelephonyError(f"PBX request failed: {exc}") from exc
        data = r.json() if r.text else {}
        if data.get("errcode") not in (0, None):
            # token might have died early — one retry with a fresh token
            if data.get("errcode") in (10001, 10003):  # invalid / expired token
                _token_cache.pop(self.workspace_id, None)
                token = await self._token()
                r = await httpx.AsyncClient(timeout=20, headers={"User-Agent": _UA}).post(
                    f"{self.base_url}{_API_PATH}{path}?access_token={token}", json=body
                )
                data = r.json() if r.text else {}
            if data.get("errcode") not in (0, None):
                raise TelephonyError(data.get("errmsg") or f"PBX error {data.get('errcode')}")
        return data

    # ------------------------------------------------------------ control
    async def place_call(self, from_extension: str, to_number: str) -> PlacedCall:
        if not from_extension:
            raise TelephonyError("This agent has no PBX extension set.")
        body: Dict[str, Any] = {"caller": from_extension, "callee": to_number, "auto_answer": "yes"}
        if self.caller_id:
            body["caller_id"] = self.caller_id
        data = await self._post("/call/dial", body)
        chan = data.get("channel_id") or data.get("call_id") or (data.get("data") or {}).get("channel_id")
        return PlacedCall(channel_id=str(chan) if chan else None, provider="cloudone")

    async def hangup(self, channel_id: Optional[str]) -> None:
        if not channel_id:
            return
        await self._post("/call/hangup", {"channel_id": channel_id})

    async def transfer(self, channel_id: Optional[str], to_extension: str) -> None:
        if not channel_id:
            return
        await self._post("/call/transfer", {"channel_id": channel_id, "type": "blind", "third_party": to_extension})

    # -------------------------------------------------------------- sip
    def sip_credentials(self, extension: Optional[str], password: Optional[str], display_name: str) -> SipCredentials:
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
