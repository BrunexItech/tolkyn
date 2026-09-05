"""Media Intelligence: live search + OpenAI synthesis into an actionable brief."""
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.media_watch import MediaWatch, WatchKind
from app.services.ai_client import ai
from app.services.search import provider_name, search_web

_QUERY_TEMPLATES = {
    "pulse": '{topic} news latest developments this week',
    "competitor": '{topic} company announcement OR launch OR funding OR news',
    "trend": 'emerging trends {topic} 2026 OR latest',
    "brand": '"{topic}" mentions OR review OR press',
}

_SYSTEM = (
    "You are a media-intelligence analyst for a marketing team. Given fresh search results, "
    "produce a tight, factual brief. Only use the provided sources. Never invent numbers or "
    "quotes. Return ONLY JSON."
)


async def build_brief(topic: str, kind: str) -> Dict[str, Any]:
    topic = topic.strip()
    q = _QUERY_TEMPLATES.get(kind, _QUERY_TEMPLATES["pulse"]).format(topic=topic)
    results = await search_web(q, max_results=9)

    sources = [
        {"title": r["title"], "url": r["url"], "source": r.get("source", ""), "published": r.get("published")}
        for r in results
        if r.get("url")
    ]

    client = ai()
    if not client.available or not results:
        return {
            "topic": topic,
            "kind": kind,
            "headline": f"Latest on {topic}" if results else f"No fresh coverage found for “{topic}”",
            "summary": (results[0]["snippet"] if results else "Try a broader or different topic."),
            "key_developments": [
                {
                    "title": r["title"],
                    "detail": r["snippet"][:220],
                    "source_url": r["url"],
                    "source_name": r.get("source", ""),
                }
                for r in results[:5]
            ],
            "sentiment": "neutral",
            "opportunities": [],
            "sources": sources,
            "provider": provider_name(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    digest = "\n\n".join(
        f"[{i+1}] {r['title']} ({r.get('source','')}, {r.get('published') or 'n/a'})\n{r['snippet']}"
        for i, r in enumerate(results)
    )
    user = (
        f"Topic: {topic}\nBrief type: {kind}\n\nSEARCH RESULTS:\n{digest}\n\n"
        "Return JSON: "
        '"headline" (<=12 words), '
        '"summary" (2-3 sentences on the current state of play), '
        '"key_developments" (3-6 items, each {"title","detail" (<=40 words),"source_url","source_name","recency" ("today"|"this week"|"this month"|"older")}), '
        '"sentiment" ("positive"|"neutral"|"mixed"|"negative"), '
        '"opportunities" (2-4 short, concrete content/marketing angles the team could act on), '
        '"risks" (0-3 short cautions).'
    )
    try:
        data = await client.json(_SYSTEM, user, temperature=0.3, max_tokens=1100)
    except Exception as exc:  # noqa: BLE001
        print(f"[media_intel] synthesis failed: {exc}")
        data = {}

    data.setdefault("headline", f"Latest on {topic}")
    data.setdefault("summary", results[0]["snippet"])
    data.setdefault("key_developments", [])
    data.setdefault("sentiment", "neutral")
    data.setdefault("opportunities", [])
    data.setdefault("risks", [])
    data.update(
        topic=topic,
        kind=kind,
        sources=sources,
        provider=provider_name(),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    return data


class MediaIntelService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    async def list_watches(self) -> List[MediaWatch]:
        res = await self.db.execute(
            select(MediaWatch)
            .where(MediaWatch.workspace_id == self.workspace_id)
            .order_by(MediaWatch.created_at.desc())
        )
        return list(res.scalars().all())

    async def add_watch(self, topic: str, kind: str) -> MediaWatch:
        brief = await build_brief(topic, kind)
        w = MediaWatch(
            topic=topic.strip(),
            kind=WatchKind(kind),
            last_brief=brief,
            last_run_at=datetime.now(timezone.utc),
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(w)
        await self.db.commit()
        await self.db.refresh(w)
        return w

    async def refresh_watch(self, watch_id: str) -> MediaWatch:
        w = await self._get(watch_id)
        w.last_brief = await build_brief(w.topic, w.kind.value)
        w.last_run_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(w)
        return w

    async def delete_watch(self, watch_id: str) -> None:
        w = await self._get(watch_id)
        await self.db.delete(w)
        await self.db.commit()

    async def _get(self, watch_id: str) -> MediaWatch:
        res = await self.db.execute(
            select(MediaWatch).where(
                MediaWatch.id == watch_id, MediaWatch.workspace_id == self.workspace_id
            )
        )
        w = res.scalar_one_or_none()
        if not w:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Watch not found")
        return w
