"""Pre-flight checks run on a post before it can be scheduled / published."""
import re
from typing import Any, Dict, List

# per-platform rules (approx, 2026)
RULES: Dict[str, Dict[str, Any]] = {
    "x": {"max_chars": 280, "soft_hashtags": 3, "media_required": False, "links_clickable": True},
    "instagram": {"max_chars": 2200, "soft_hashtags": 12, "hard_hashtags": 30, "media_required": True, "links_clickable": False},
    "tiktok": {"max_chars": 2200, "soft_hashtags": 6, "media_required": True, "video_only": True, "links_clickable": False},
    "linkedin": {"max_chars": 3000, "soft_hashtags": 5, "media_required": False, "links_clickable": True, "first_n": 140},
    "facebook": {"max_chars": 63206, "soft_hashtags": 6, "media_required": False, "links_clickable": True},
    "youtube": {"max_chars": 5000, "soft_hashtags": 15, "media_required": True, "video_only": True, "title_required": True},
    "whatsapp": {"max_chars": 4096, "soft_hashtags": 0, "media_required": False, "links_clickable": True},
}

_RISKY = ("guaranteed", "free money", "click here now", "act now", "limited time only!!!", "100% free", "make $$$")
_LINK_RE = re.compile(r"https?://\S+")


def _level_order(level: str) -> int:
    return {"error": 0, "warn": 1, "info": 2}[level]


def run_checks(
    body: str,
    platforms: List[str],
    media: List[Dict[str, Any]],
    hashtags: List[str],
    link: str | None,
    title: str | None = None,
) -> Dict[str, Any]:
    body = body or ""
    findings: List[Dict[str, str]] = []
    links_in_body = _LINK_RE.findall(body)
    all_links = links_in_body + ([link] if link else [])
    tag_count = len(hashtags) + len(re.findall(r"(?<!\w)#\w+", body))
    has_media = len(media) > 0
    has_video = any((m.get("type") == "video") for m in media)

    if not body.strip() and not has_media:
        findings.append({"platform": "all", "level": "error", "message": "Post has no text and no media."})
    if not platforms:
        findings.append({"platform": "all", "level": "error", "message": "Select at least one platform."})

    for lower in _RISKY:
        if lower in body.lower():
            findings.append(
                {"platform": "all", "level": "warn", "message": f'Spam-trigger phrase: “{lower}”.'}
            )
            break

    for missing_alt in [m for m in media if m.get("type") == "image" and not (m.get("alt") or "").strip()]:
        findings.append(
            {"platform": "all", "level": "info", "message": "An image is missing alt text (accessibility + reach)."}
        )
        break

    for p in platforms:
        r = RULES.get(p)
        if not r:
            continue
        n = len(body)
        if n > r["max_chars"]:
            findings.append(
                {"platform": p, "level": "error", "message": f"{n}/{r['max_chars']} characters — too long for {p}."}
            )
        elif n > r["max_chars"] * 0.92:
            findings.append(
                {"platform": p, "level": "warn", "message": f"{n}/{r['max_chars']} characters — close to the {p} limit."}
            )

        if r.get("media_required") and not has_media:
            lvl = "error" if p in ("instagram", "tiktok", "youtube") else "warn"
            findings.append({"platform": p, "level": lvl, "message": f"{p} posts need an image or video."})
        if r.get("video_only") and has_media and not has_video:
            findings.append({"platform": p, "level": "warn", "message": f"{p} expects a video, not just an image."})

        if r.get("hard_hashtags") and tag_count > r["hard_hashtags"]:
            findings.append({"platform": p, "level": "error", "message": f"{tag_count} hashtags — {p} allows {r['hard_hashtags']}."})
        elif r.get("soft_hashtags") is not None and tag_count > r["soft_hashtags"]:
            findings.append(
                {"platform": p, "level": "warn", "message": f"{tag_count} hashtags — {p} performs best with ≤{r['soft_hashtags']}."}
            )

        if all_links and not r.get("links_clickable", True):
            findings.append(
                {"platform": p, "level": "info", "message": f"Links aren't clickable on {p} — consider ‘link in bio’."}
            )
        if len(all_links) > 2 and r.get("links_clickable", True):
            findings.append({"platform": p, "level": "warn", "message": f"{len(all_links)} links — {p} may suppress reach."})

        if r.get("title_required") and not (title or "").strip():
            findings.append({"platform": p, "level": "warn", "message": "YouTube needs a title."})

    findings.sort(key=lambda f: _level_order(f["level"]))
    errors = [f for f in findings if f["level"] == "error"]
    warnings = [f for f in findings if f["level"] == "warn"]
    return {
        "ok": len(errors) == 0,
        "errors": len(errors),
        "warnings": len(warnings),
        "findings": findings,
        "char_count": len(body),
        "hashtag_count": tag_count,
        "link_count": len(all_links),
        "has_media": has_media,
    }
