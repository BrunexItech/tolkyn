from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call import (
    AgentStatus,
    Call,
    CallAgent,
    CallDirection,
    CallOutcome,
    CallState,
)
from app.core.crypto import encrypt
from app.models.team_member import MemberStatus, TeamMember, TeamRole
from app.models.user import User
from app.services.call_center_seed import build_agents, build_calls
from app.services.telephony import TelephonyError, get_config, get_provider

_VOLUME_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hour_label(h: int) -> str:
    if h == 12:
        return "12p"
    return f"{h}a" if h < 12 else f"{h - 12}p"


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class CallCenterService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    # ---- seeding ----------------------------------------------------
    async def _ensure_seed(self) -> None:
        n = (
            await self.db.execute(
                select(func.count()).select_from(Call).where(Call.workspace_id == self.workspace_id)
            )
        ).scalar() or 0
        a = (
            await self.db.execute(
                select(func.count()).select_from(CallAgent).where(CallAgent.workspace_id == self.workspace_id)
            )
        ).scalar() or 0
        if n and a:
            return

        me = (await self.db.execute(select(User).where(User.id == self.user_id))).scalar_one_or_none()
        self_name = (me.name if me else None) or "You"

        if a == 0:
            res = await self.db.execute(
                select(TeamMember).where(
                    TeamMember.workspace_id == self.workspace_id,
                    TeamMember.role != TeamRole.OWNER,
                    TeamMember.status != MemberStatus.SUSPENDED,
                )
            )
            teammates = [m.name or m.email.split("@")[0].title() for m in res.scalars().all()]
            for ag in build_agents(self.workspace_id, self.user_id, self_name, teammates):
                self.db.add(ag)
        # Only seed demo calls when there's no real phone system — once a
        # trunk is live the queue/history fills from real webhook events.
        cfg = await get_config(self.db, self.workspace_id)
        if n == 0 and not (cfg and cfg.is_active and cfg.provider != "simulated"):
            for c in build_calls(self.workspace_id, self.user_id):
                self.db.add(c)
        await self.db.commit()

    # ---- reads ----------------------------------------------------
    async def _self_agent(self) -> CallAgent:
        res = await self.db.execute(
            select(CallAgent).where(
                CallAgent.workspace_id == self.workspace_id, CallAgent.is_self.is_(True)
            )
        )
        return res.scalar_one()

    async def _active(self) -> Optional[Call]:
        res = await self.db.execute(
            select(Call).where(
                Call.workspace_id == self.workspace_id,
                Call.state == CallState.ACTIVE,
                Call.agent_id == self.user_id,
            )
        )
        return res.scalar_one_or_none()

    async def queue(self) -> List[Dict[str, Any]]:
        res = await self.db.execute(
            select(Call)
            .where(Call.workspace_id == self.workspace_id, Call.state == CallState.QUEUED)
            .order_by(Call.queued_at.asc())
        )
        now = _now()
        out = []
        for c in res.scalars().all():
            if c.ivr_state:  # caller is still in the phone menu — not answerable yet
                continue
            waited = int((now - _aware(c.queued_at)).total_seconds()) if c.queued_at else 0
            out.append({
                "id": c.id,
                "name": c.contact_name or "Unknown caller",
                "number": c.number,
                "reason": c.reason or "New inquiry",
                "waitedSec": max(waited, 0),
            })
        return out

    async def recent(self, limit: int = 20) -> List[Dict[str, Any]]:
        res = await self.db.execute(
            select(Call)
            .where(Call.workspace_id == self.workspace_id, Call.state == CallState.ENDED)
            .order_by(Call.ended_at.desc().nullslast())
            .limit(limit)
        )
        return [self._recent_row(c) for c in res.scalars().all()]

    def _recent_row(self, c: Call) -> Dict[str, Any]:
        return {
            "id": c.id,
            "name": c.contact_name or "Unknown caller",
            "number": c.number,
            "direction": c.direction.value,
            "outcome": (c.outcome or CallOutcome.COMPLETED).value,
            "durationSec": c.duration_sec or 0,
            "at": _aware(c.ended_at or c.started_at or c.queued_at or c.created_at).isoformat(),
            "recorded": bool(c.recorded),
        }

    def _active_row(self, c: Optional[Call]) -> Optional[Dict[str, Any]]:
        if not c:
            return None
        return {
            "id": c.id,
            "name": c.contact_name or "Unknown caller",
            "number": c.number,
            "direction": c.direction.value,
            "startedAt": _aware(c.started_at or c.created_at).isoformat(),
            "muted": bool(c.muted),
            "onHold": bool(c.on_hold),
        }

    async def agents(self) -> List[Dict[str, Any]]:
        res = await self.db.execute(
            select(CallAgent)
            .where(CallAgent.workspace_id == self.workspace_id)
            .order_by(CallAgent.is_self.desc(), CallAgent.name.asc())
        )
        active = await self._active()
        rows = []
        for a in res.scalars().all():
            st = a.status.value
            if a.is_self:
                st = "on-call" if active else a.status.value
            rows.append({
                "id": a.id,
                "name": a.name,
                "initials": a.initials,
                "status": st,
                "callsToday": a.calls_today,
                "isSelf": bool(a.is_self),
                "sipExtension": a.sip_extension or None,
            })
        return rows

    async def _calls_between(self, start: datetime, end: datetime) -> List[Call]:
        res = await self.db.execute(
            select(Call).where(
                Call.workspace_id == self.workspace_id,
                Call.state == CallState.ENDED,
                Call.ended_at >= start,
                Call.ended_at < end,
            )
        )
        return list(res.scalars().all())

    @staticmethod
    def _kpis(calls: List[Call]) -> Dict[str, float]:
        total = len(calls)
        answered = [c for c in calls if c.outcome in (CallOutcome.COMPLETED, CallOutcome.TRANSFERRED)]
        missed = [c for c in calls if c.outcome == CallOutcome.MISSED]
        handled = [c.duration_sec for c in answered if c.duration_sec]
        aht = round(sum(handled) / len(handled)) if handled else 0
        answerable = len(answered) + len(missed)
        answer_rate = round(len(answered) / answerable * 100, 1) if answerable else 0.0
        return {
            "calls": total,
            "aht": aht,
            "answer_rate": answer_rate,
            "missed": len(missed),
        }

    async def stats(self) -> Dict[str, Any]:
        now = _now()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today = await self._calls_between(day_start, now)
        yest = await self._calls_between(day_start - timedelta(days=1), day_start)

        t = self._kpis(today)
        y = self._kpis(yest)

        def delta(cur: float, prev: float) -> float:
            if not prev:
                return 0.0
            return round((cur - prev) / prev * 100, 1)

        return {
            "callsToday": t["calls"],
            "callsDelta": delta(t["calls"], y["calls"]),
            "avgHandleSec": t["aht"],
            "ahtDelta": delta(t["aht"], y["aht"]),
            "answerRate": t["answer_rate"],
            "answerDelta": round(t["answer_rate"] - y["answer_rate"], 1),
            "missed": t["missed"],
            "missedDelta": delta(t["missed"], y["missed"]),
        }

    async def volume_by_hour(self) -> List[Dict[str, Any]]:
        now = _now()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        res = await self.db.execute(
            select(Call).where(
                Call.workspace_id == self.workspace_id,
                Call.state == CallState.ENDED,
                Call.ended_at >= day_start,
            )
        )
        buckets = {h: {"Inbound": 0, "Outbound": 0} for h in _VOLUME_HOURS}
        for c in res.scalars().all():
            ref = _aware(c.started_at or c.ended_at)
            if not ref:
                continue
            h = ref.hour
            if h < _VOLUME_HOURS[0]:
                h = _VOLUME_HOURS[0]
            elif h > _VOLUME_HOURS[-1]:
                h = _VOLUME_HOURS[-1]
            key = "Inbound" if c.direction == CallDirection.INBOUND else "Outbound"
            buckets[h][key] += 1
        return [{"name": _hour_label(h), **buckets[h]} for h in _VOLUME_HOURS]

    async def presence(self) -> str:
        agent = await self._self_agent()
        active = await self._active()
        return "on-call" if active else agent.status.value

    async def ivr_calls(self) -> List[Dict[str, Any]]:
        res = await self.db.execute(
            select(Call)
            .where(Call.workspace_id == self.workspace_id, Call.state == CallState.QUEUED)
            .order_by(Call.queued_at.asc())
        )
        rows = [c for c in res.scalars().all() if c.ivr_state]
        if not rows:
            return []
        from app.services.ivr_service import IvrService

        flow = await IvrService(self.db, self.workspace_id).get_flow(create=False)
        menus = (flow.menus if flow else {}) or {}
        out = []
        for c in rows:
            mkey = (c.ivr_state or {}).get("menu", "main")
            out.append({
                "id": c.id,
                "name": c.contact_name or "Unknown caller",
                "number": c.number,
                "menu": mkey,
                "prompt": (menus.get(mkey, {}) or {}).get("prompt", ""),
            })
        return out

    async def overview(self) -> Dict[str, Any]:
        await self._ensure_seed()
        return {
            "stats": await self.stats(),
            "queue": await self.queue(),
            "recent": await self.recent(),
            "agents": await self.agents(),
            "volume": await self.volume_by_hour(),
            "active": self._active_row(await self._active()),
            "presence": await self.presence(),
            "ivrCalls": await self.ivr_calls(),
        }

    async def poll(self) -> Dict[str, Any]:
        """Light payload for the frontend's interval refresh."""
        await self._ensure_seed()
        return {
            "queue": await self.queue(),
            "active": self._active_row(await self._active()),
            "presence": await self.presence(),
            "ivrCalls": await self.ivr_calls(),
        }

    # ---- mutations -----------------------------------------------
    async def _get_call(self, call_id: str) -> Call:
        res = await self.db.execute(
            select(Call).where(Call.id == call_id, Call.workspace_id == self.workspace_id)
        )
        c = res.scalar_one_or_none()
        if not c:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Call not found")
        return c

    async def _bump_self(self, delta: int = 1) -> None:
        agent = await self._self_agent()
        agent.calls_today = max(0, (agent.calls_today or 0) + delta)

    async def dial(self, name: str, number: str) -> Call:
        await self._ensure_seed()
        if await self._active():
            raise HTTPException(status.HTTP_409_CONFLICT, "End the current call first")

        provider = await get_provider(self.db, self.workspace_id)
        channel_id = None
        if provider.name != "simulated":
            agent = await self._self_agent()
            try:
                placed = await provider.place_call(agent.sip_extension or "", number.strip())
                channel_id = placed.channel_id
            except TelephonyError as exc:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Phone system: {exc.message}")

        c = Call(
            direction=CallDirection.OUTBOUND,
            state=CallState.ACTIVE,
            contact_name=(name or "").strip() or "Unknown caller",
            number=number.strip(),
            recorded=True,
            started_at=_now(),
            agent_id=self.user_id,
            provider_channel_id=channel_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(c)
        await self._bump_self(1)
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def answer(self, call_id: str) -> Call:
        if await self._active():
            raise HTTPException(status.HTTP_409_CONFLICT, "End the current call first")
        c = await self._get_call(call_id)
        if c.state != CallState.QUEUED:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Call is not in the queue")
        c.state = CallState.ACTIVE
        c.started_at = _now()
        c.recorded = True
        c.agent_id = self.user_id
        await self._bump_self(1)
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def hangup(self, call_id: str, outcome: str = "completed") -> Call:
        c = await self._get_call(call_id)
        if c.state != CallState.ACTIVE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active call to end")
        if c.provider_channel_id:
            provider = await get_provider(self.db, self.workspace_id)
            try:
                await provider.hangup(c.provider_channel_id)
            except TelephonyError:
                pass  # the leg may already be gone — end our record regardless
        c.state = CallState.ENDED
        c.outcome = CallOutcome(outcome)
        c.ended_at = _now()
        base = _aware(c.started_at) or _aware(c.ended_at)
        c.duration_sec = max(0, int((_aware(c.ended_at) - base).total_seconds())) if base else 0
        c.on_hold = False
        c.muted = False
        if c.outcome in (CallOutcome.MISSED, CallOutcome.VOICEMAIL):
            c.recorded = c.outcome == CallOutcome.VOICEMAIL
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def set_flags(self, call_id: str, muted: Optional[bool], on_hold: Optional[bool]) -> Call:
        c = await self._get_call(call_id)
        if c.state != CallState.ACTIVE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active call")
        if muted is not None:
            c.muted = muted
        if on_hold is not None:
            c.on_hold = on_hold
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def dismiss(self, call_id: str) -> None:
        c = await self._get_call(call_id)
        if c.state != CallState.QUEUED:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Call is not in the queue")
        c.state = CallState.ENDED
        c.outcome = CallOutcome.MISSED
        c.ended_at = _now()
        await self.db.commit()

    async def set_presence(self, value: str) -> str:
        agent = await self._self_agent()
        agent.status = AgentStatus(value)
        await self.db.commit()
        return agent.status.value

    async def simulate_inbound(self) -> Call:
        await self._ensure_seed()
        import random

        pool = [
            ("Dana Whitfield", "+1 415 555 0148", "Billing question"),
            ("Marcus Lund", "+44 20 7946 0991", "Integration help"),
            ("Unknown caller", "+1 312 555 0176", "New inquiry"),
            ("Bright Media", "+1 646 555 0122", "Renewal"),
            ("Unknown caller", "+61 2 5550 0133", "Pricing"),
        ]
        name, number, reason = random.choice(pool)
        c = Call(
            direction=CallDirection.INBOUND,
            state=CallState.QUEUED,
            contact_name=name,
            number=number,
            reason=reason,
            queued_at=_now(),
            workspace_id=self.workspace_id,
        )
        self.db.add(c)
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def simulate_inbound_ivr(self) -> Call:
        """Inbound call that enters the live IVR (for end-to-end testing)."""
        await self._ensure_seed()
        import random

        from app.services.ivr_service import IvrService

        name, number = random.choice([
            ("Dana Whitfield", "+254 712 555 148"),
            ("Marcus Lund", "+44 20 7946 0991"),
            ("Unknown caller", "+1 312 555 0176"),
        ])
        c = Call(
            direction=CallDirection.INBOUND,
            state=CallState.QUEUED,
            contact_name=name,
            number=number,
            reason="Inbound call",
            queued_at=_now(),
            workspace_id=self.workspace_id,
        )
        self.db.add(c)
        await self.db.commit()
        await self.db.refresh(c)
        await IvrService(self.db, self.workspace_id).on_call_enter(c)
        await self.db.refresh(c)
        return c

    async def ivr_press(self, call_id: str, digit: str) -> Dict[str, Any]:
        """Feed a DTMF key to a call currently sitting in the IVR."""
        from app.services.ivr_service import IvrService

        c = await self._get_call(call_id)
        if not c.ivr_state:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This call is not in the phone menu")
        result = await IvrService(self.db, self.workspace_id).on_digit(c, str(digit))
        await self.db.refresh(c)
        return result

    # ---- telephony (SIP trunk) -----------------------------------
    async def softphone_config(self) -> Dict[str, Any]:
        """SIP-over-WebSocket registration details for this agent's browser
        softphone. `configured: false` => the UI stays in simulated mode."""
        await self._ensure_seed()
        cfg = await get_config(self.db, self.workspace_id)
        if not (cfg and cfg.is_active and cfg.provider == "cloudone"):
            return {"configured": False, "provider": "simulated"}
        agent = await self._self_agent()
        provider = await get_provider(self.db, self.workspace_id)
        creds = provider.sip_credentials(agent.sip_extension, agent.sip_password_enc, agent.name)
        return {
            "configured": creds.configured,
            "provider": "cloudone",
            "ws_url": creds.ws_url,
            "domain": creds.domain,
            "extension": creds.extension,
            "password": creds.password,
            "display_name": creds.display_name,
        }

    async def set_agent_sip(self, agent_id: str, extension: Optional[str], password: Optional[str]) -> CallAgent:
        res = await self.db.execute(
            select(CallAgent).where(CallAgent.id == agent_id, CallAgent.workspace_id == self.workspace_id)
        )
        agent = res.scalar_one_or_none()
        if not agent:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
        if extension is not None:
            agent.sip_extension = extension.strip() or None
        if password:
            agent.sip_password_enc = encrypt(password)
        elif password == "":
            agent.sip_password_enc = None
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def handle_pbx_event(self, payload: Dict[str, Any]) -> None:
        """Yeastar P-Series call events. Shapes vary by firmware/config, so
        we read defensively: match on the PBX channel id, move our Call row's
        state, and create a queued row for a brand-new inbound ring."""
        etype = (payload.get("type") or payload.get("event") or "").lower()
        d = payload.get("data") or payload
        channel = str(d.get("channel_id") or d.get("call_id") or d.get("channelId") or "") or None
        number = d.get("caller_number") or d.get("from") or d.get("callee_number") or d.get("number") or ""
        name = d.get("caller_name") or d.get("from_name") or "Unknown caller"

        existing = None
        if channel:
            existing = (
                await self.db.execute(
                    select(Call).where(
                        Call.workspace_id == self.workspace_id, Call.provider_channel_id == channel
                    )
                )
            ).scalar_one_or_none()

        if any(k in etype for k in ("ring", "incoming", "new_call", "inbound")):
            if existing:
                return
            call = Call(
                direction=CallDirection.INBOUND,
                state=CallState.QUEUED,
                contact_name=name,
                number=str(number) or "unknown",
                reason="Inbound call",
                provider_channel_id=channel,
                queued_at=_now(),
                workspace_id=self.workspace_id,
            )
            self.db.add(call)
            await self.db.commit()
            await self.db.refresh(call)
            from app.services.ivr_service import IvrService

            await IvrService(self.db, self.workspace_id).on_call_enter(call)
            return

        if not existing:
            return

        # DTMF key press while the caller is in the IVR menu
        if any(k in etype for k in ("dtmf", "digit", "key")) and existing.ivr_state:
            digit = str(d.get("digit") or d.get("dtmf") or d.get("key") or "").strip()
            if digit:
                from app.services.ivr_service import IvrService

                await IvrService(self.db, self.workspace_id).on_digit(existing, digit)
            return

        if any(k in etype for k in ("timeout", "noinput", "no_input")) and existing.ivr_state:
            from app.services.ivr_service import IvrService

            await IvrService(self.db, self.workspace_id).on_timeout(existing)
            return

        if any(k in etype for k in ("answer", "bridge", "connected")):
            if existing.state == CallState.QUEUED:
                existing.state = CallState.ACTIVE
                existing.started_at = _now()
        elif any(k in etype for k in ("hangup", "end", "terminate", "cdr")):
            if existing.state != CallState.ENDED:
                existing.state = CallState.ENDED
                existing.ended_at = _now()
                base = _aware(existing.started_at)
                existing.outcome = (
                    CallOutcome.COMPLETED if base else CallOutcome.MISSED
                )
                existing.duration_sec = (
                    max(0, int((_aware(existing.ended_at) - base).total_seconds())) if base else 0
                )
        await self.db.commit()
