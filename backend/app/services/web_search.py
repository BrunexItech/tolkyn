"""Candidate-site search for Lead Discovery.

Two paths: a self-hosted SearXNG instance (queries 70+ real search engines
at once, see docker-compose.yml's `searxng` service + searxng/settings.yml)
when SEARXNG_URL is configured, falling back to scraping DuckDuckGo's HTML
page directly (the original, still fully working, approach) when it isn't
configured or a query to it fails for any reason -- this is purely additive,
nothing about the DuckDuckGo path changed.
"""
import asyncio
import re
from typing import List
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup

from app.core.config import settings

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)
_ENDPOINT = "https://html.duckduckgo.com/html/"

_SKIP_HOSTS = (
    "duckduckgo.com", "google.", "bing.com", "youtube.com", "facebook.com",
    "twitter.com", "x.com", "instagram.com", "linkedin.com", "wikipedia.org",
    "reddit.com", "pinterest.", "yelp.com", "amazon.", "medium.com",
    "crunchbase.com", "glassdoor.", "indeed.com", "trustpilot.com",
)


def _clean(url: str) -> str | None:
    if url.startswith("//"):
        url = "https:" + url
    parsed = urlparse(url)
    if parsed.path.startswith("/l/") and "uddg" in parsed.query:
        real = parse_qs(parsed.query).get("uddg", [None])[0]
        if real:
            url = unquote(real)
            parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    host = parsed.netloc.lower()
    if any(s in host for s in _SKIP_HOSTS):
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


async def _search_domains_searxng(queries: List[str], per_query: int, limit: int) -> List[str]:
    found: list[str] = []
    seen: set[str] = set()
    base = settings.SEARXNG_URL.rstrip("/")

    async with httpx.AsyncClient(timeout=15.0) as client:
        async def one(q: str) -> None:
            try:
                r = await client.get(f"{base}/search", params={"q": q, "format": "json"})
                r.raise_for_status()
                for item in (r.json().get("results") or [])[: per_query * 3]:
                    root = _clean(item.get("url", ""))
                    if root and root not in seen:
                        seen.add(root)
                        found.append(root)
            except Exception as exc:  # noqa: BLE001
                print(f"[web_search] searxng query failed ({q}): {exc}")

        await asyncio.gather(*(one(q) for q in queries[:10]))

    return found[:limit]


async def _search_domains_ddg(queries: List[str], per_query: int, limit: int) -> List[str]:
    found: list[str] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(
        timeout=15.0, headers={"User-Agent": _UA}, follow_redirects=True
    ) as client:
        async def one(q: str) -> None:
            try:
                r = await client.post(_ENDPOINT, data={"q": q})
                if r.status_code != 200:
                    return
                soup = BeautifulSoup(r.text, "html.parser")
                anchors = soup.select("a.result__a") or soup.find_all("a", href=True)
                for a in anchors[: per_query * 3]:
                    root = _clean(a.get("href", ""))
                    if root and root not in seen:
                        seen.add(root)
                        found.append(root)
            except Exception as exc:  # noqa: BLE001
                print(f"[web_search] ddg query failed ({q}): {exc}")

        await asyncio.gather(*(one(q) for q in queries[:10]))

    return found[:limit]


async def search_domains(queries: List[str], per_query: int = 10, limit: int = 60) -> List[str]:
    """Return a de-duplicated list of candidate site roots for the given
    queries. Tries SearXNG first when configured (wider net, many engines);
    falls back to DuckDuckGo on any failure or empty result, or always when
    SearXNG isn't configured at all."""
    if settings.SEARXNG_URL:
        found = await _search_domains_searxng(queries, per_query, limit)
        if found:
            return found
        print("[web_search] searxng returned nothing — falling back to duckduckgo")
    return await _search_domains_ddg(queries, per_query, limit)
