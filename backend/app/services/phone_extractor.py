"""
Extract *valid* phone numbers from a web page.

Strategy:
  1. `tel:` links  -> highest confidence, usually already E.164.
  2. Visible text  -> parsed with libphonenumber (google's `phonenumbers`),
     using a region guessed from the site's TLD, and only kept if the number
     validates.
Numbers are returned in international format, de-duplicated, best first.
"""
from typing import List, Optional
from urllib.parse import urlparse

import phonenumbers
from bs4 import BeautifulSoup

# ccTLD -> ISO region for libphonenumber's default region
_TLD_REGION = {
    "uk": "GB", "co.uk": "GB", "de": "DE", "fr": "FR", "es": "ES", "it": "IT",
    "nl": "NL", "be": "BE", "ch": "CH", "at": "AT", "se": "SE", "no": "NO",
    "dk": "DK", "fi": "FI", "ie": "IE", "pt": "PT", "pl": "PL", "cz": "CZ",
    "ca": "CA", "au": "AU", "nz": "NZ", "in": "IN", "sg": "SG", "hk": "HK",
    "za": "ZA", "ke": "KE", "ng": "NG", "ae": "AE", "br": "BR", "mx": "MX",
    "jp": "JP", "us": "US",
}
_DEFAULT_REGION = "US"


def _region_for(url: str) -> str:
    host = urlparse(url if "://" in url else "https://" + url).netloc.lower()
    parts = host.split(".")
    if len(parts) >= 2:
        last2 = ".".join(parts[-2:])
        if last2 in _TLD_REGION:
            return _TLD_REGION[last2]
        if parts[-1] in _TLD_REGION:
            return _TLD_REGION[parts[-1]]
    return _DEFAULT_REGION


def _normalise(num: phonenumbers.PhoneNumber) -> str:
    return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.INTERNATIONAL)


def _key(num: phonenumbers.PhoneNumber) -> str:
    return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)


def extract_phones(html: str, page_url: str, *, limit: int = 3) -> List[str]:
    region = _region_for(page_url)
    soup = BeautifulSoup(html, "html.parser")

    ordered: List[str] = []
    seen: set[str] = set()

    def add(candidate: str, hint_region: Optional[str]) -> None:
        try:
            parsed = phonenumbers.parse(candidate, hint_region or region)
        except phonenumbers.NumberParseException:
            return
        if not phonenumbers.is_valid_number(parsed):
            return
        k = _key(parsed)
        if k in seen:
            return
        seen.add(k)
        ordered.append(_normalise(parsed))

    # 1) tel: links
    for a in soup.select('a[href^="tel:"]'):
        raw = a.get("href", "")[4:].strip()
        add(raw, None if raw.startswith("+") else region)

    # 2) visible text (drop scripts/styles)
    for tag in soup(["script", "style", "noscript"]):
        tag.extract()
    text = soup.get_text(" ", strip=True)
    for match in phonenumbers.PhoneNumberMatcher(text, region):
        if phonenumbers.is_valid_number(match.number):
            k = _key(match.number)
            if k not in seen:
                seen.add(k)
                ordered.append(_normalise(match.number))

    return ordered[:limit]
