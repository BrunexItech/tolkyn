"""Thin HTTP client for the whatsapp-worker service (self-hosted Baileys
sessions, one per workspace — the unofficial, at-your-own-risk WhatsApp path
while waiting on real Cloud API access). Every call is workspace-scoped by
the worker's own URL path, so there's no cross-tenant leakage possible here —
each workspace only ever touches its own session."""
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings

_HEADERS = {"X-Internal-Secret": settings.INTERNAL_SHARED_SECRET}


class WhatsAppWebError(Exception):
    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.code = code


async def connect(workspace_id: str) -> Dict[str, Any]:
    async with _client() as client:
        r = await client.post(f"{settings.WHATSAPP_WORKER_URL}/sessions/{workspace_id}/connect")
    if r.status_code >= 300:
        raise WhatsAppWebError(_err(r))
    return r.json()


async def status(workspace_id: str) -> Dict[str, Any]:
    async with _client(timeout=10) as client:
        r = await client.get(f"{settings.WHATSAPP_WORKER_URL}/sessions/{workspace_id}/status")
    if r.status_code >= 300:
        raise WhatsAppWebError(_err(r))
    return r.json()


async def send_message(workspace_id: str, to: str, text: str) -> Dict[str, Any]:
    async with _client() as client:
        r = await client.post(
            f"{settings.WHATSAPP_WORKER_URL}/sessions/{workspace_id}/send", json={"to": to, "text": text}
        )
    if r.status_code >= 300:
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        raise WhatsAppWebError(data.get("error") or _err(r), code=data.get("code"))
    return r.json()


async def disconnect(workspace_id: str) -> None:
    async with _client(timeout=15) as client:
        r = await client.delete(f"{settings.WHATSAPP_WORKER_URL}/sessions/{workspace_id}")
    if r.status_code >= 300 and r.status_code != 404:
        raise WhatsAppWebError(_err(r))


class _client:
    """Wraps httpx.AsyncClient so every call site here shares one thing: a
    worker that's unreachable (not started, still booting, crashed, or the
    admin has genuinely never enabled it) surfaces as a normal WhatsAppWebError
    — the same "nothing connected" outcome as a bad response — instead of an
    unhandled connection exception turning into a 500 for every caller."""

    def __init__(self, timeout: float = 20):
        self._client = httpx.AsyncClient(timeout=timeout, headers=_HEADERS)

    async def __aenter__(self) -> "_client":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def _call(self, method: str, url: str, **kwargs) -> httpx.Response:
        try:
            return await self._client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise WhatsAppWebError(f"WhatsApp worker unreachable: {exc}") from exc

    async def get(self, url: str, **kwargs) -> httpx.Response:
        return await self._call("GET", url, **kwargs)

    async def post(self, url: str, **kwargs) -> httpx.Response:
        return await self._call("POST", url, **kwargs)

    async def delete(self, url: str, **kwargs) -> httpx.Response:
        return await self._call("DELETE", url, **kwargs)


def _err(r: httpx.Response) -> str:
    try:
        return str(r.json().get("error") or f"HTTP {r.status_code}")
    except Exception:  # noqa: BLE001
        return f"HTTP {r.status_code}"
