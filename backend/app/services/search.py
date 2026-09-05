"""
Web / news search for Media Intelligence.

Preference order:  Tavily (built for AI)  ->  Serper (Google)  ->  keyless DuckDuckGo.
"""
from typing import Any, Dict, List

import httpx
from bs4 import BeautifulSoup

from app.core.config import settings

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)


async def search_web(query: str, *, max_results: int = 8, recent: bool = True) -> List[Dict[str, Any]]:
    query = (query or "").strip()
    if not query:
        return []
    if settings.TAVILY_API_KEY:
        out = await _tavily(query, max_results)
        if out:
            return out
    if settings.SERPER_API_KEY:
        out = await _serper(query, max_results, recent)
        if out:
            return out
    return await _ddg(query, max_results)


def provider_name() -> str:
    if settings.TAVILY_API_KEY:
        return "tavily"
    if settings.SERPER_API_KEY:
        return "serper"
    return "duckduckgo"


async def _tavily(query: str, k: int) -> List[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=25.0) as c:
            r = await c.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.TAVILY_API_KEY,
                    "query": query,
                    "max_results": k,
                    "topic": "news",
                    "search_depth": "advanced",
                    "include_answer": False,
                },
            )
            r.raise_for_status()
            return [
                {
                    "title": it.get("title", ""),
                    "url": it.get("url", ""),
                    "snippet": (it.get("content") or "")[:600],
                    "published": it.get("published_date"),
                    "source": _host(it.get("url", "")),
                }
                for it in r.json().get("results", [])
            ]
    except Exception as exc:  # noqa: BLE001
        print(f"[search] tavily failed: {exc}")
        return []


async def _serper(query: str, k: int, recent: bool) -> List[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=20.0) as c:
            r = await c.post(
                "https://google.serper.dev/news" if recent else "https://google.serper.dev/search",
                headers={"X-API-KEY": settings.SERPER_API_KEY, "Content-Type": "application/json"},
                json={"q": query, "num": k},
            )
            r.raise_for_status()
            data = r.json()
            items = data.get("news") or data.get("organic") or []
            return [
                {
                    "title": it.get("title", ""),
                    "url": it.get("link", ""),
                    "snippet": (it.get("snippet") or "")[:600],
                    "published": it.get("date"),
                    "source": it.get("source") or _host(it.get("link", "")),
                }
                for it in items[:k]
            ]
    except Exception as exc:  # noqa: BLE001
        print(f"[search] serper failed: {exc}")
        return []


async def _ddg(query: str, k: int) -> List[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient(
            timeout=15.0, headers={"User-Agent": _UA}, follow_redirects=True
        ) as c:
            r = await c.post("https://html.duckduckgo.com/html/", data={"q": query})
            soup = BeautifulSoup(r.text, "html.parser")
            out: List[Dict[str, Any]] = []
            for res in soup.select(".result")[: k * 2]:
                a = res.select_one("a.result__a")
                sn = res.select_one(".result__snippet")
                if not a:
                    continue
                url = a.get("href", "")
                out.append(
                    {
                        "title": a.get_text(strip=True),
                        "url": url,
                        "snippet": sn.get_text(" ", strip=True)[:600] if sn else "",
                        "published": None,
                        "source": _host(url),
                    }
                )
                if len(out) >= k:
                    break
            return out
    except Exception as exc:  # noqa: BLE001
        print(f"[search] ddg failed: {exc}")
        return []


def _host(url: str) -> str:
    try:
        return url.split("/")[2].replace("www.", "")
    except Exception:
        return ""
