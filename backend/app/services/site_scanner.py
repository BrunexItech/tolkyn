"""Shallow site scan: homepage + likely contact pages -> merged contact record."""
import asyncio
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx

from app.services.crawler.lead_extractor import LeadExtractor
from app.services.phone_extractor import extract_phones

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)
_CONTACT_PATHS = ["/contact", "/contact-us", "/contactus", "/about", "/about-us", "/team", "/company"]
_extractor = LeadExtractor()


def _root(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


async def scan_site(url: str, *, timeout: float = 12.0) -> Optional[Dict[str, Any]]:
    """Fetch a site's homepage + a couple of contact pages and extract a lead record."""
    root = _root(url)
    pages: List[str] = [root] + [urljoin(root + "/", p.lstrip("/")) for p in _CONTACT_PATHS]

    merged_emails: set[str] = set()
    phones_ordered: List[str] = []
    phones_seen: set[str] = set()
    socials: Dict[str, str] = {}
    base: Optional[Dict[str, Any]] = None
    fetched = 0

    def collect_phones(html: str, page_url: str) -> None:
        for ph in extract_phones(html, page_url):
            digits = "".join(c for c in ph if c.isdigit())
            if digits not in phones_seen:
                phones_seen.add(digits)
                phones_ordered.append(ph)

    async with httpx.AsyncClient(
        timeout=timeout, headers={"User-Agent": _UA}, follow_redirects=True
    ) as client:
        try:
            home = await client.get(root)
            home.raise_for_status()
            if "text/html" not in home.headers.get("content-type", "").lower():
                return None
            base = _extractor.extract_from_html(home.text, str(home.url))
            collect_phones(home.text, str(home.url))
            fetched = 1
        except Exception as exc:  # noqa: BLE001
            print(f"[site_scanner] homepage failed {root}: {exc}")
            return None

        merged_emails.update(base.get("emails") or [])
        socials.update(base.get("social_links") or {})

        async def sub(path_url: str) -> None:
            nonlocal fetched
            try:
                r = await client.get(path_url)
                if r.status_code != 200 or "text/html" not in r.headers.get("content-type", "").lower():
                    return
                data = _extractor.extract_from_html(r.text, str(r.url))
                merged_emails.update(data.get("emails") or [])
                for k, v in (data.get("social_links") or {}).items():
                    socials.setdefault(k, v)
                collect_phones(r.text, str(r.url))
                fetched += 1
            except Exception:
                return

        await asyncio.gather(*(sub(u) for u in pages[1:5]))

    emails = sorted(_clean_emails(merged_emails))
    phones = phones_ordered[:3]
    if not emails and not phones and not base.get("company"):
        return None

    return {
        "company": base.get("company") or base.get("domain") or root,
        "domain": base.get("domain") or urlparse(root).netloc,
        "website": root,
        "source_url": root,
        "title": base.get("title", ""),
        "description": base.get("description", ""),
        "keywords": base.get("keywords") or [],
        "headers": base.get("headers") or [],
        "emails": emails,
        "email": emails[0] if emails else None,
        "phones": phones,
        "phone": phones[0] if phones else None,
        "social_links": socials,
        "pages_scanned": fetched,
    }


_PLACEHOLDER_EMAIL_HINTS = ("example.", "yourdomain", "domain.com", "email@", "@brand.com", "sentry.io", "wixpress.com")


def _clean_emails(emails: set[str]) -> List[str]:
    out = []
    for e in emails:
        el = e.lower().strip()
        if any(h in el for h in _PLACEHOLDER_EMAIL_HINTS):
            continue
        if el.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")):
            continue
        out.append(el)
    return out


async def scan_many(urls: List[str], *, concurrency: int = 6) -> List[Dict[str, Any]]:
    sem = asyncio.Semaphore(concurrency)

    async def guarded(u: str) -> Optional[Dict[str, Any]]:
        async with sem:
            try:
                return await scan_site(u)
            except Exception:
                return None

    results = await asyncio.gather(*(guarded(u) for u in urls))
    return [r for r in results if r]
