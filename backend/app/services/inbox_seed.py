"""Seed a realistic multi-platform inbox on first use (there is no live API feed yet)."""
from datetime import datetime, timedelta, timezone
from typing import List

from app.models.inbox import InboxMessage, InboxThread, ThreadKind, ThreadStatus

_NOW = lambda m: datetime.now(timezone.utc) - timedelta(minutes=m)  # noqa: E731

_SEED = [
    {
        "platform": "instagram", "kind": ThreadKind.COMMENT, "author_name": "maya.builds",
        "author_handle": "@maya.builds", "context": "on your post: “New feature drop 🚀”",
        "sentiment": "positive", "priority": 1, "ago": 8,
        "msgs": [("in", "maya.builds", "this is exactly what I've been waiting for. when does the calendar sync ship?")],
    },
    {
        "platform": "x", "kind": ThreadKind.MENTION, "author_name": "Devon Park",
        "author_handle": "@devonp", "context": "mentioned you in a reply",
        "sentiment": "neutral", "priority": 2, "ago": 21,
        "msgs": [("in", "Devon Park", "@tolkyn does the pre-flight check handle LinkedIn character limits too?")],
    },
    {
        "platform": "facebook", "kind": ThreadKind.COMMENT, "author_name": "Sandra Whitlock",
        "author_handle": "Sandra Whitlock", "context": "on your ad: “Try Tolkyn free”",
        "sentiment": "negative", "priority": 3, "ago": 34,
        "msgs": [("in", "Sandra Whitlock", "Signed up last week and still can't connect my TikTok. Support hasn't replied.")],
    },
    {
        "platform": "tiktok", "kind": ThreadKind.COMMENT, "author_name": "kev_makes",
        "author_handle": "@kev_makes", "context": "on your video: “3 hooks that doubled watch time”",
        "sentiment": "positive", "priority": 1, "ago": 46,
        "msgs": [("in", "kev_makes", "saving this. what tool do you use to schedule the carousels?")],
    },
    {
        "platform": "linkedin", "kind": ThreadKind.DM, "author_name": "Priya Nair",
        "author_handle": "Priya Nair · Head of Growth", "context": "direct message",
        "sentiment": "positive", "priority": 2, "ago": 70,
        "msgs": [
            ("in", "Priya Nair", "Hi — we're evaluating Tolkyn for a 12-person team. Is there a demo you'd recommend?"),
            ("out", "You", "Hi Priya! Happy to help. I'll send over a tailored walkthrough — what channels matter most to you?"),
            ("in", "Priya Nair", "Mostly LinkedIn + Instagram, and we care a lot about approvals."),
        ],
    },
    {
        "platform": "instagram", "kind": ThreadKind.DM, "author_name": "cafe.lumen",
        "author_handle": "@cafe.lumen", "context": "direct message",
        "sentiment": "neutral", "priority": 2, "ago": 95,
        "msgs": [("in", "cafe.lumen", "do you support scheduling Reels with original audio?")],
    },
    {
        "platform": "youtube", "kind": ThreadKind.COMMENT, "author_name": "GrowthLab",
        "author_handle": "@GrowthLab", "context": "on your video: “County targeting tutorial”",
        "sentiment": "positive", "priority": 1, "ago": 130,
        "msgs": [("in", "GrowthLab", "Underrated feature. Would love a follow-up on exclusion zones.")],
    },
    {
        "platform": "x", "kind": ThreadKind.COMMENT, "author_name": "annoyed_user",
        "author_handle": "@annoyed_user", "context": "replied to your post",
        "sentiment": "negative", "priority": 3, "ago": 160,
        "msgs": [("in", "annoyed_user", "the mobile app keeps logging me out. fix pls")],
    },
    {
        "platform": "facebook", "kind": ThreadKind.REVIEW, "author_name": "Tomás Alvarez",
        "author_handle": "Tomás Alvarez", "context": "left a 5★ review",
        "sentiment": "positive", "priority": 1, "ago": 240,
        "msgs": [("in", "Tomás Alvarez", "Cut our posting time in half. The unified inbox alone is worth it.")],
    },
    {
        "platform": "instagram", "kind": ThreadKind.COMMENT, "author_name": "lena.studio",
        "author_handle": "@lena.studio", "context": "on your post: “Behind the scenes”",
        "sentiment": "neutral", "priority": 2, "ago": 300,
        "msgs": [("in", "lena.studio", "what's the pricing for agencies managing 20+ accounts?")],
    },
    {
        "platform": "linkedin", "kind": ThreadKind.MENTION, "author_name": "Marcus Lund",
        "author_handle": "Marcus Lund", "context": "tagged you in a post",
        "sentiment": "positive", "priority": 2, "ago": 420,
        "msgs": [("in", "Marcus Lund", "Been using @Tolkyn for a month — the AI studio prompts are genuinely good.")],
    },
    {
        "platform": "tiktok", "kind": ThreadKind.DM, "author_name": "fitwithsam",
        "author_handle": "@fitwithsam", "context": "direct message",
        "sentiment": "neutral", "priority": 2, "ago": 520,
        "msgs": [("in", "fitwithsam", "collab? I post fitness content, 40k followers")],
    },
]


def build_threads(workspace_id: str, user_id: str) -> List[InboxThread]:
    threads: List[InboxThread] = []
    for s in _SEED:
        t = InboxThread(
            platform=s["platform"],
            kind=s["kind"],
            status=ThreadStatus.OPEN,
            author_name=s["author_name"],
            author_handle=s["author_handle"],
            context=s["context"],
            sentiment=s["sentiment"],
            priority=s["priority"],
            unread=1 if s["msgs"][-1][0] == "in" else 0,
            last_message_at=_NOW(s["ago"]),
            owner_id=user_id,
            workspace_id=workspace_id,
        )
        for i, (direction, name, body) in enumerate(s["msgs"]):
            t.messages.append(
                InboxMessage(
                    direction=direction,
                    author_name=name,
                    body=body,
                    via="manual" if direction == "out" else None,
                    at=_NOW(s["ago"] + (len(s["msgs"]) - 1 - i) * 3),
                )
            )
        threads.append(t)
    return threads
