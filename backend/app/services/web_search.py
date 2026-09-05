"""Keyless web search via the DuckDuckGo HTML endpoint. Best-effort."""
import asyncio
import re
from typing import List
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup

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


async def search_domains(queries: List[str], per_query: int = 8, limit: int = 20) -> List[str]:
    """Return a de-duplicated list of candidate site roots for the given queries."""
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
                print(f"[web_search] query failed ({q}): {exc}")

        await asyncio.gather(*(one(q) for q in queries[:5]))

    return found[:limit]
