"""Pull real comments + Instagram DMs from Upload-Post and normalise them into
inbox-thread dicts the InboxService can upsert.

Field names vary per platform and aren't fully documented, so every read
below tries several likely keys rather than assuming one — confirmed against
live responses: Facebook's real comment shape is
{id, message, created_time, like_count} (no "text"/"timestamp" fields at
all), which is why an earlier version of this file silently returned blank
comment text for every real comment."""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from app.services.upload_post_client import UploadPostError, upload_post

# platforms whose comments Upload-Post can list
COMMENT_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "tiktok"]

_MEDIA_PER_PLATFORM = 12
_NEG = {"hate", "worst", "terrible", "awful", "broken", "scam", "refund", "cancel",
        "disappointed", "bug", "not working", "useless", "poor", "angry", "bad"}
_POS = {"love", "great", "amazing", "awesome", "perfect", "excellent", "thank",
        "helpful", "best", "brilliant", "nice", "good", "fantastic", "wonderful"}


def _sentiment(text: str) -> str:
    t = (text or "").lower()
    if any(w in t for w in _NEG):
        return "negative"
    if any(w in t for w in _POS):
        return "positive"
    return "neutral"


def _priority(sentiment: str, kind: str) -> int:
    if sentiment == "negative":
        return 3
    if kind == "dm":
        return 2
    return 1


def _unwrap_text(v: Any) -> str:
    """A comment's text field is a plain string on Facebook/Instagram/etc.,
    but LinkedIn wraps it in a rich-text object: {"attributes": [], "text":
    "..."}.  Handle both without assuming either."""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return str(v.get("text") or "")
    return ""


def _comment_text(c: Dict[str, Any]) -> str:
    for key in ("text", "message", "comment", "comment_text", "body"):
        v = c.get(key)
        if v:
            unwrapped = _unwrap_text(v)
            if unwrapped:
                return unwrapped
    return ""


def _comment_time(c: Dict[str, Any]) -> Any:
    for key in ("timestamp", "created_time", "created_at", "time"):
        v = c.get(key)
        if v:
            return v
    # LinkedIn nests it: {"created": {"time": <epoch ms>}}
    created = c.get("created")
    if isinstance(created, dict) and created.get("time"):
        return created["time"]
    return None


def _comment_likes(c: Dict[str, Any]) -> Optional[int]:
    for key in ("like_count", "likes", "likes_count", "num_likes"):
        v = c.get(key)
        if isinstance(v, (int, float)):
            return int(v)
    return None


def _comment_author(c: Dict[str, Any]) -> tuple[str, Optional[str]]:
    """Returns (display_name, handle) trying every convention we've seen or
    might see: a nested {"user": {...}}, Meta's {"from": {...}}, or flat
    fields directly on the comment. LinkedIn's comment endpoint only gives an
    opaque actor URN (no name/username at all) — shown as "LinkedIn member"
    rather than a cryptic id."""
    user = c.get("user") or c.get("from") or {}
    username = user.get("username") or c.get("username")
    name = user.get("name") or user.get("full_name") or c.get("author_name") or c.get("from_name")
    if not username and not name and c.get("actor"):
        return "LinkedIn member", None
    display = username or name or "Someone"
    handle = f"@{username}" if username else None
    return display, handle


async def _fetch_platform(platform: str, username: str) -> tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    """One platform's comment threads. Isolated so platforms run concurrently
    and one slow/broken platform can't block the others."""
    out: List[Dict[str, Any]] = []
    notes: List[Dict[str, str]] = []

    try:
        media_resp = await upload_post.media(platform, username, limit=_MEDIA_PER_PLATFORM)
    except UploadPostError as exc:
        return out, [{"platform": platform, "message": exc.message}]

    media_items = [m for m in (media_resp.get("media") or [])[:_MEDIA_PER_PLATFORM] if m.get("id")]

    async def _one_post(m: Dict[str, Any]) -> List[Dict[str, Any]]:
        post_id = m["id"]
        try:
            c_resp = await upload_post.comments(platform, username, post_id=str(post_id), limit=50)
        except UploadPostError as exc:
            notes.append({"platform": platform, "message": exc.message})
            return []
        caption = (m.get("caption") or "").strip().replace("\n", " ")
        context = f'on your post: “{caption[:56]}”' if caption else "on your post"
        threads: List[Dict[str, Any]] = []
        for c in c_resp.get("comments") or []:
            cid = c.get("id")
            if not cid:
                continue
            text = _comment_text(c)
            sent = _sentiment(text)
            name, handle = _comment_author(c)
            threads.append({
                "external_id": f"{platform}:comment:{cid}",
                "platform": platform,
                "kind": "comment",
                "author_name": name,
                "author_handle": handle,
                "context": context,
                "permalink": m.get("permalink"),
                "sentiment": sent,
                "priority": _priority(sent, "comment"),
                "last_message_at": _comment_time(c),
                "ref": {"post_id": str(post_id), "comment_id": str(cid)},
                "messages": [{
                    "external_id": str(cid),
                    "direction": "in",
                    "author_name": name,
                    "body": text,
                    "at": _comment_time(c),
                    "like_count": _comment_likes(c),
                }],
            })
        return threads

    results = await asyncio.gather(*(_one_post(m) for m in media_items))
    for r in results:
        out.extend(r)
    return out, notes


async def _fetch_instagram_dms(username: str) -> tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    out: List[Dict[str, Any]] = []
    notes: List[Dict[str, str]] = []
    try:
        dm_resp = await upload_post.dm_conversations(username)
    except UploadPostError as exc:
        return out, [{"platform": "instagram", "message": exc.message}]

    for conv in dm_resp.get("conversations") or []:
        conv_id = conv.get("id")
        if not conv_id:
            continue
        parts = ((conv.get("participants") or {}).get("data")) or []
        other = next((p for p in parts if p.get("username")), {})
        other_name = other.get("username") or "Instagram user"
        raw_msgs = ((conv.get("messages") or {}).get("data")) or []
        msgs = []
        for mm in reversed(raw_msgs):  # Meta returns newest-first
            frm = mm.get("from") or {}
            body = mm.get("message") or ""
            if not body:
                continue
            inbound = frm.get("username") == other.get("username")
            msgs.append({
                "external_id": mm.get("id"),
                "direction": "in" if inbound else "out",
                "author_name": frm.get("username") or "You",
                "body": body,
                "at": mm.get("created_time"),
            })
        if not msgs:
            continue
        last = msgs[-1]
        sent = _sentiment(next((m["body"] for m in reversed(msgs) if m["direction"] == "in"), ""))
        out.append({
            "external_id": f"instagram:dm:{conv_id}",
            "platform": "instagram",
            "kind": "dm",
            "author_name": other_name,
            "author_handle": f"@{other_name}" if other.get("username") else None,
            "context": "Instagram direct message",
            "permalink": None,
            "sentiment": sent,
            "priority": _priority(sent, "dm"),
            "last_message_at": last["at"],
            "ref": {"dm_recipient_id": other.get("id"), "conversation_id": conv_id},
            "messages": msgs,
        })
    return out, notes


async def fetch_threads(username: str, platforms: List[str]) -> Dict[str, Any]:
    """Returns {"threads": [...], "notes": [{platform, message}]} — notes explain
    why a platform returned nothing (needs reconnect, no Page pinned, ...).
    Every platform (and every post's comment fetch within it) runs
    concurrently — sequential fetching was the reason a full sync used to
    take 15+ seconds."""
    targets = [p for p in platforms if p in COMMENT_PLATFORMS]
    jobs = [_fetch_platform(p, username) for p in targets]
    if "instagram" in platforms:
        jobs.append(_fetch_instagram_dms(username))

    results = await asyncio.gather(*jobs) if jobs else []

    out: List[Dict[str, Any]] = []
    notes: List[Dict[str, str]] = []
    for threads, plat_notes in results:
        out.extend(threads)
        notes.extend(plat_notes)

    seen: set = set()
    uniq_notes = []
    for n in notes:
        k = (n["platform"], n["message"])
        if k not in seen:
            seen.add(k)
            uniq_notes.append(n)
    return {"threads": out, "notes": uniq_notes}
