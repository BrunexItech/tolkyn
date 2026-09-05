"""
Analytics.

Real per-platform metrics come from Upload-Post's analytics API for every
connected account. When Upload-Post is unavailable (no key, no connections, or
the call fails) metrics fall back to a *modelled* series: deterministic per
workspace + platform and anchored to real data we hold (connected accounts,
follower counts, posts actually published through Tolkyn).
"""
import hashlib
import random
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.post import Post, PostStatus
from app.models.provider_profile import ProviderProfile
from app.models.social_connection import ConnectionStatus, SocialConnection
from app.services.upload_post_client import UploadPostError, upload_post

_ADAPTERS: Dict[str, Callable] = {}  # legacy hook, unused now Upload-Post is wired

_BASE_ENGAGEMENT = {
    "instagram": 0.048, "tiktok": 0.061, "facebook": 0.021, "x": 0.014,
    "linkedin": 0.038, "youtube": 0.043, "whatsapp": 0.09,
}

# shared TTL cache so overview/timeseries/by_platform hit Upload-Post once
_LIVE_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_LIVE_TTL = 600.0        # 10 min for a good response
_LIVE_FAIL_TTL = 60.0    # back off 1 min after a failure


def _seed(*parts: str) -> int:
    return int(hashlib.sha256("|".join(parts).encode()).hexdigest(), 16) % (2**31)


def _rng(*parts: str) -> random.Random:
    return random.Random(_seed(*parts))


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


class AnalyticsService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id
        self._live_ok = False

    async def _connections(self) -> List[SocialConnection]:
        res = await self.db.execute(
            select(SocialConnection).where(
                SocialConnection.workspace_id == self.workspace_id,
                SocialConnection.status == ConnectionStatus.CONNECTED,
            )
        )
        return list(res.scalars().all())

    async def _published_posts(self) -> List[Post]:
        res = await self.db.execute(
            select(Post).where(
                Post.workspace_id == self.workspace_id,
                Post.status.in_([PostStatus.PUBLISHED, PostStatus.PARTIAL]),
            )
        )
        return list(res.scalars().all())

    async def _profile_username(self) -> Optional[str]:
        res = await self.db.execute(
            select(ProviderProfile).where(
                ProviderProfile.workspace_id == self.workspace_id,
                ProviderProfile.provider == "upload_post",
            )
        )
        row = res.scalar_one_or_none()
        return row.external_username if row else None

    # --------------------------------------------------------- live fetch
    async def _live(self, conns: List[SocialConnection]) -> Dict[str, Any]:
        """Return {platform: metrics, "_total_impressions": int} or {} when live
        data isn't available. Also writes follower counts back onto connections."""
        if not upload_post.enabled or not conns:
            return {}
        username = await self._profile_username()
        if not username:
            return {}
        platforms = sorted(c.platform for c in conns)
        key = f"{username}|{','.join(platforms)}"

        hit = _LIVE_CACHE.get(key)
        if hit and time.time() - hit[0] < (_LIVE_TTL if hit[1] else _LIVE_FAIL_TTL):
            data = hit[1]
        else:
            data = {}
            try:
                raw = await upload_post.analytics(username, platforms)
                data = {p: m for p, m in raw.items() if isinstance(m, dict)}
                try:
                    tot = await upload_post.total_impressions(username)
                    data["_total_impressions"] = int(_num(tot.get("total_impressions")))
                except UploadPostError:
                    pass
            except UploadPostError:
                data = {}
            _LIVE_CACHE[key] = (time.time(), data)

        if data:
            self._live_ok = True
            await self._writeback_followers(conns, data)
        return data

    async def _writeback_followers(self, conns: List[SocialConnection], live: Dict[str, Any]) -> None:
        changed = False
        for c in conns:
            m = live.get(c.platform)
            if isinstance(m, dict):
                f = int(_num(m.get("followers")))
                if f and f != (c.followers or 0):
                    c.followers = f
                    changed = True
        if changed:
            try:
                await self.db.commit()
            except Exception:  # pragma: no cover
                await self.db.rollback()

    @staticmethod
    def _merged_timeseries(live: Dict[str, Any], days: int) -> List[Dict[str, Any]]:
        """Sum every platform's reach_timeseries by date -> last `days` days."""
        by_date: Dict[str, float] = {}
        for p, m in live.items():
            if not isinstance(m, dict):
                continue
            for pt in m.get("reach_timeseries") or []:
                d = pt.get("date")
                if d:
                    by_date[d] = by_date.get(d, 0.0) + _num(pt.get("value"))
        if not by_date:
            return []
        ordered = sorted(by_date.items())[-days:]
        out = []
        for d, v in ordered:
            dt = datetime.strptime(d, "%Y-%m-%d").date()
            reach = int(v)
            out.append({
                "date": d,
                "label": dt.strftime("%d %b"),
                "reach": reach,
                "engaged": int(reach * 0.045),
                "impressions": reach,
            })
        return out

    @staticmethod
    def _engagement(m: Dict[str, Any]) -> float:
        return _num(m.get("likes")) + _num(m.get("comments")) + _num(m.get("shares")) + _num(m.get("saves"))

    @staticmethod
    def _rate(engaged: float, reach: float) -> float:
        """Engagement rate %, guarded against tiny-denominator noise."""
        if reach < 20:
            return 0.0
        return round(min(engaged / reach * 100, 100.0), 2)

    def provider(self, conns: List[SocialConnection]) -> str:
        return "live" if self._live_ok else "modelled"

    # ------------------------------------------------------------- overview
    async def overview(self, days: int = 30) -> Dict[str, Any]:
        conns = await self._connections()
        posts = await self._published_posts()
        live = await self._live(conns)

        if live:
            pts = self._merged_timeseries(live, days * 2) or self._merged_timeseries(live, days)
            cur = pts[-days:] if len(pts) > days else pts
            prev = pts[-days * 2:-days] if len(pts) >= days * 2 else []
            reach = sum(p["reach"] for p in cur) or int(_num(live.get("_total_impressions")))
            prev_reach = sum(p["reach"] for p in prev) or reach or 1
            engaged = int(sum(self._engagement(m) for m in live.values() if isinstance(m, dict)))
            followers = sum(int(_num(m.get("followers"))) for m in live.values() if isinstance(m, dict))
            followers = followers or sum(c.followers or 0 for c in conns)
            profile_views = int(sum(_num(m.get("profileViews")) for m in live.values() if isinstance(m, dict)))
            return {
                "provider": "live",
                "window_days": days,
                "connected": [c.platform for c in conns],
                "reach": reach,
                "reach_delta": round((reach - prev_reach) / prev_reach * 100, 1) if prev else 0.0,
                "engaged": engaged,
                "engagement_rate": self._rate(engaged, reach),
                "engagement_delta": 0.0,
                "followers": followers,
                "followers_delta": 0.0,
                "new_followers": 0,
                "profile_views": profile_views,
                "posts_published": len(posts),
                "avg_reach_per_post": int(reach / max(len(posts), 1)),
            }
        return self._overview_modelled(conns, posts, days)

    def _overview_modelled(self, conns, posts, days: int) -> Dict[str, Any]:
        series = self._series(conns, days * 2)
        cur = series[-days:]
        prev = series[-days * 2:-days] or cur
        reach = sum(d["reach"] for d in cur)
        prev_reach = sum(d["reach"] for d in prev) or 1
        eng = sum(d["engaged"] for d in cur)
        prev_eng = sum(d["engaged"] for d in prev) or 1
        followers = sum(c.followers or 0 for c in conns)
        follower_growth = int(followers * 0.021)
        return {
            "provider": "modelled",
            "window_days": days,
            "connected": [c.platform for c in conns],
            "reach": reach,
            "reach_delta": round((reach - prev_reach) / prev_reach * 100, 1),
            "engaged": eng,
            "engagement_rate": round(eng / reach * 100, 2) if reach else 0.0,
            "engagement_delta": round((eng - prev_eng) / prev_eng * 100, 1),
            "followers": followers,
            "followers_delta": round(follower_growth / (followers or 1) * 100, 1),
            "new_followers": follower_growth,
            "profile_views": 0,
            "posts_published": len(posts),
            "avg_reach_per_post": int(reach / max(len(posts), 1)),
        }

    # ----------------------------------------------------------- timeseries
    async def timeseries(self, days: int = 30) -> Dict[str, Any]:
        conns = await self._connections()
        live = await self._live(conns)
        if live:
            rows = self._merged_timeseries(live, days)
            if rows:
                return {"points": rows, "provider": "live"}
        return {"points": self._series(conns, days), "provider": "modelled"}

    def _series(self, conns: List[SocialConnection], days: int) -> List[Dict[str, Any]]:
        today = date.today()
        out: List[Dict[str, Any]] = []
        n_platforms = max(len(conns), 1)
        for i in range(days):
            d = today - timedelta(days=days - 1 - i)
            r = _rng(self.workspace_id, d.isoformat())
            weekday_boost = 1.15 if d.weekday() < 5 else 0.85
            base = 900 * n_platforms * weekday_boost
            trend = 1 + i / (days * 4)
            reach = int(base * trend * (0.75 + r.random() * 0.6))
            eng_rate = 0.03 + r.random() * 0.03
            out.append({
                "date": d.isoformat(),
                "label": d.strftime("%d %b"),
                "reach": reach,
                "engaged": int(reach * eng_rate),
                "impressions": int(reach * (1.4 + r.random() * 0.6)),
            })
        return out

    # ---------------------------------------------------------- by platform
    async def by_platform(self, days: int = 30) -> List[Dict[str, Any]]:
        conns = await self._connections()
        posts = await self._published_posts()
        live = await self._live(conns)
        out = []
        for c in conns:
            posts_here = sum(1 for p in posts if c.platform in (p.platforms or []))
            m = live.get(c.platform) if live else None
            if isinstance(m, dict):
                reach = int(_num(m.get("impressions")) or _num(m.get("reach")))
                eng = self._engagement(m)
                followers = int(_num(m.get("followers"))) or (c.followers or 0)
                out.append({
                    "platform": c.platform,
                    "handle": c.handle,
                    "followers": followers,
                    "followers_delta": 0.0,
                    "reach": reach,
                    "engagement_rate": self._rate(eng, reach),
                    "posts": posts_here,
                    "best_time": self._peak_hour(m),
                })
            else:
                r = _rng(self.workspace_id, c.platform, "plat")
                followers = c.followers or 0
                reach = int(followers * (2.2 + r.random() * 2.5) + posts_here * 800)
                eng_rate = _BASE_ENGAGEMENT.get(c.platform, 0.03) * (0.8 + r.random() * 0.5)
                out.append({
                    "platform": c.platform,
                    "handle": c.handle,
                    "followers": followers,
                    "followers_delta": round((0.5 + r.random() * 3), 1),
                    "reach": reach,
                    "engagement_rate": round(eng_rate * 100, 2),
                    "posts": posts_here,
                    "best_time": r.choice(["9:00", "12:00", "17:00", "19:00", "21:00"]),
                })
        out.sort(key=lambda x: x["reach"], reverse=True)
        return out

    @staticmethod
    def _peak_hour(m: Dict[str, Any]) -> str:
        ts = m.get("reach_timeseries") or []
        if not ts:
            return "—"
        # busiest weekday of the window -> a sensible default posting hour
        weekday_totals: Dict[int, float] = {}
        for pt in ts:
            try:
                wd = datetime.strptime(pt["date"], "%Y-%m-%d").weekday()
            except (KeyError, ValueError):
                continue
            weekday_totals[wd] = weekday_totals.get(wd, 0.0) + _num(pt.get("value"))
        if not weekday_totals:
            return "—"
        best_wd = max(weekday_totals, key=weekday_totals.get)
        return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][best_wd] + " 18:00"

    # ------------------------------------------------------------ top posts
    async def top_posts(self, limit: int = 8) -> List[Dict[str, Any]]:
        username = await self._profile_username()
        if upload_post.enabled and username:
            try:
                cached = await upload_post.post_analytics_cached(username, limit=max(limit * 3, 50))
                rows = self._map_cached_posts(cached.get("posts") or [])
                if rows:
                    return rows[:limit]
            except UploadPostError:
                pass
        # No real per-post analytics — spread the (real or modelled) channel
        # totals across the posts that actually ran, so the numbers stay
        # consistent with the rest of the dashboard.
        return await self._top_posts_derived(limit)

    def _map_cached_posts(self, posts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = []
        for p in posts:
            if not p.get("post_id"):
                continue
            metrics = p.get("metrics") or {}
            reach = int(_num(metrics.get("reach")) or _num(metrics.get("impressions")) or _num(metrics.get("views")))
            likes = int(_num(metrics.get("likes")))
            comments = int(_num(metrics.get("comments")))
            shares = int(_num(metrics.get("shares")))
            eng = likes + comments + shares
            rows.append({
                "id": p.get("post_id"),
                "platform": p.get("platform"),
                "platforms": [p.get("platform")] if p.get("platform") else [],
                "text": "",
                "published_at": p.get("captured_at") or p.get("date"),
                "reach": reach,
                "engagement_rate": self._rate(eng, reach),
                "likes": likes,
                "comments": comments,
                "shares": shares,
            })
        rows.sort(key=lambda x: (x["reach"], x["likes"]), reverse=True)
        return rows

    async def _top_posts_derived(self, limit: int) -> List[Dict[str, Any]]:
        posts = await self._published_posts()
        if not posts:
            return []
        by_plat = {row["platform"]: row for row in await self.by_platform(30)}
        # reach contributed per post on each platform
        per_post: Dict[str, float] = {}
        rate: Dict[str, float] = {}
        for plat, row in by_plat.items():
            n = max(row.get("posts", 0), 1)
            per_post[plat] = row.get("reach", 0) / n
            rate[plat] = row.get("engagement_rate", 0.0)

        rows = []
        for p in posts:
            plats = p.platforms or ["x"]
            r = _rng(self.workspace_id, p.id, "postvar")
            wobble = 0.7 + r.random() * 0.6  # ±30% so posts aren't identical
            reach = int(sum(per_post.get(pl, 0) for pl in plats) * wobble)
            er = round(
                (sum(rate.get(pl, 0.0) for pl in plats) / len(plats)) * wobble, 2
            )
            eng_abs = reach * er / 100
            rows.append({
                "id": p.id,
                "platform": plats[0],
                "platforms": p.platforms,
                "text": (p.body or p.title or "")[:120],
                "published_at": p.published_at.isoformat() if p.published_at else None,
                "reach": reach,
                "engagement_rate": er,
                "likes": int(eng_abs * 0.7),
                "comments": int(eng_abs * 0.2),
                "shares": int(eng_abs * 0.1),
            })
        rows.sort(key=lambda x: x["reach"], reverse=True)
        return rows[:limit]

    # ---- reusable by campaigns / audience ----
    async def followers_by_platform(self) -> Dict[str, int]:
        conns = await self._connections()
        await self._live(conns)  # refresh follower counts when possible
        return {c.platform: (c.followers or 0) for c in conns}
