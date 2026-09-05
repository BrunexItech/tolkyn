"""Thin async wrapper around the OpenAI chat API (SDK calls run in a thread)."""
import asyncio
import json
from typing import Any, Dict, List, Optional

from openai import OpenAI

from app.core.config import settings

_FAST_MODEL = "gpt-4o-mini"


class AIClient:
    def __init__(self) -> None:
        self._client: Optional[OpenAI] = None
        if settings.OPENAI_API_KEY:
            try:
                self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
            except Exception as exc:  # pragma: no cover
                print(f"[AIClient] init failed: {exc}")

    @property
    def available(self) -> bool:
        return self._client is not None

    async def json(
        self,
        system: str,
        user: str,
        *,
        model: str = _FAST_MODEL,
        temperature: float = 0.3,
        max_tokens: int = 900,
        timeout: float = 45.0,
    ) -> Dict[str, Any]:
        raw = await asyncio.wait_for(
            asyncio.to_thread(
                self._complete,
                system,
                user,
                model,
                temperature,
                max_tokens,
                True,
            ),
            timeout=timeout,
        )
        return json.loads(raw)

    async def text(
        self,
        system: str,
        user: str,
        *,
        model: str = _FAST_MODEL,
        temperature: float = 0.6,
        max_tokens: int = 1400,
        timeout: float = 60.0,
    ) -> str:
        return await asyncio.wait_for(
            asyncio.to_thread(
                self._complete,
                system,
                user,
                model,
                temperature,
                max_tokens,
                False,
            ),
            timeout=timeout,
        )

    def _complete(
        self,
        system: str,
        user: str,
        model: str,
        temperature: float,
        max_tokens: int,
        as_json: bool,
    ) -> str:
        if not self._client:
            raise RuntimeError("OpenAI is not configured")
        kwargs: Dict[str, Any] = dict(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if as_json:
            kwargs["response_format"] = {"type": "json_object"}
        resp = self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ("{}" if as_json else "")


_singleton: Optional[AIClient] = None


def ai() -> AIClient:
    global _singleton
    if _singleton is None:
        _singleton = AIClient()
    return _singleton
