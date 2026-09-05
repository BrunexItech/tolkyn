"""Inbound call-flow (IVR / auto-attendant) — builder, validator, simulator
and the runtime the PBX event webhook drives.

Design goals:
- **No guesswork.** Every save is validated; `simulate()` returns the exact
  transcript a caller would hear for a given key sequence.
- **Provider-agnostic.** The runtime moves our own `Call` rows and asks the
  telephony provider to transfer legs. Works fully against the simulated
  provider today; the moment a real trunk + event webhook are connected it is
  already live.
"""
from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, available_timezones

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call import Call, CallAgent, CallOutcome, CallState
from app.models.ivr import IvrFlow

ACTIONS = {
    "ring_all",
    "ring_agent",
    "submenu",
    "voicemail",
    "message",
    "transfer",
    "hangup",
    "repeat",
}
_EXHAUSTED = {"ring_all", "voicemail", "hangup"}
_AFTER_HOURS = {"ring_all", "voicemail", "hangup", "message"}
_DIGITS = {*(str(i) for i in range(10)), "*", "#"}
_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
_MAX_HOPS = 6  # guard against a mis-built submenu loop

_DEFAULT_MENUS: Dict[str, Any] = {
    "main": {
        "prompt": "Thank you for calling. Press 1 to speak with our team, or press 2 to leave a voicemail.",
        "options": [
            {"digit": "1", "label": "Speak with the team", "action": "ring_all", "target": ""},
            {"digit": "2", "label": "Leave a voicemail", "action": "voicemail", "target": ""},
        ],
    }
}


class IvrService:
    def __init__(self, db: AsyncSession, workspace_id: str):
        self.db = db
        self.workspace_id = workspace_id

    # ------------------------------------------------------------------ load
    async def get_flow(self, *, create: bool = True) -> Optional[IvrFlow]:
        row = (
            await self.db.execute(
                select(IvrFlow).where(IvrFlow.workspace_id == self.workspace_id)
            )
        ).scalar_one_or_none()
        if row or not create:
            return row
        row = IvrFlow(
            workspace_id=self.workspace_id,
            is_active=False,
            greeting="",
            menus=_DEFAULT_MENUS,
            hours={d: [["09:00", "17:00"]] for d in ["mon", "tue", "wed", "thu", "fri"]},
        )
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def as_dict(self) -> Dict[str, Any]:
        f = await self.get_flow()
        assert f is not None
        return _flow_dict(f)

    # ---------------------------------------------------------------- update
    async def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        f = await self.get_flow()
        assert f is not None

        if "menus" in patch and patch["menus"] is not None:
            patch["menus"] = _validate_menus(patch["menus"])
        if "hours" in patch and patch["hours"] is not None:
            patch["hours"] = _validate_hours(patch["hours"])
        if patch.get("timezone") and patch["timezone"] not in available_timezones():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown timezone")
        if "on_exhausted" in patch and patch["on_exhausted"] not in _EXHAUSTED:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"on_exhausted must be one of {sorted(_EXHAUSTED)}",
            )
        if "after_hours_action" in patch and patch["after_hours_action"] not in _AFTER_HOURS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"after_hours_action must be one of {sorted(_AFTER_HOURS)}",
            )
        if "timeout_seconds" in patch:
            patch["timeout_seconds"] = max(3, min(30, int(patch["timeout_seconds"])))
        if "max_retries" in patch:
            patch["max_retries"] = max(0, min(5, int(patch["max_retries"])))

        # cross-check: every ring_agent target must be a real agent
        menus = patch.get("menus", f.menus)
        agent_ids = {
            a.id
            for a in (
                await self.db.execute(
                    select(CallAgent).where(CallAgent.workspace_id == self.workspace_id)
                )
            ).scalars()
        }
        for mkey, menu in menus.items():
            for opt in menu.get("options", []):
                if opt["action"] == "ring_agent" and opt["target"] not in agent_ids:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        f"Menu '{mkey}' key {opt['digit']}: unknown agent",
                    )
                if opt["action"] == "submenu" and opt["target"] not in menus:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        f"Menu '{mkey}' key {opt['digit']}: submenu '{opt['target']}' does not exist",
                    )

        for k, v in patch.items():
            setattr(f, k, v)
        await self.db.commit()
        await self.db.refresh(f)
        return _flow_dict(f)

    # -------------------------------------------------------------- simulate
    async def simulate(self, digits: List[str]) -> Dict[str, Any]:
        """Walk the tree for a key sequence and return the full transcript +
        the resolved action. Pure — never touches call rows."""
        f = await self.get_flow()
        assert f is not None
        agents = {
            a.id: a.name
            for a in (
                await self.db.execute(
                    select(CallAgent).where(CallAgent.workspace_id == self.workspace_id)
                )
            ).scalars()
        }

        transcript: List[Dict[str, str]] = []
        if not f.is_active:
            transcript.append({"kind": "note", "text": "IVR is turned off — callers ring all agents directly."})
            return {"transcript": transcript, "resolved": {"action": "ring_all", "target": "", "label": "All agents"}}

        if f.greeting.strip():
            transcript.append({"kind": "play", "text": f.greeting.strip()})

        menu_key = "main"
        retries = 0
        hops = 0
        for d in digits:
            hops += 1
            if hops > _MAX_HOPS:
                transcript.append({"kind": "note", "text": "Too many menu hops — stopping."})
                break
            menu = f.menus.get(menu_key) or {}
            transcript.append({"kind": "prompt", "text": (menu.get("prompt") or "").strip()})
            opt = next((o for o in menu.get("options", []) if o["digit"] == str(d)), None)
            if not opt:
                retries += 1
                transcript.append({"kind": "caller", "text": f"pressed {d}"})
                transcript.append({"kind": "play", "text": f.invalid_message.strip()})
                if retries > f.max_retries:
                    return _resolve_exhausted(f, transcript)
                continue

            transcript.append({"kind": "caller", "text": f"pressed {d} — {opt['label']}"})
            action = opt["action"]
            if action == "submenu":
                menu_key = opt["target"]
                retries = 0
                continue
            if action == "repeat":
                retries = 0
                continue
            return {
                "transcript": transcript,
                "resolved": _label_action(action, opt["target"], agents),
            }

        # ran out of keys without resolving
        menu = f.menus.get(menu_key) or {}
        transcript.append({"kind": "prompt", "text": (menu.get("prompt") or "").strip()})
        transcript.append({"kind": "note", "text": "Caller did not press anything (timeout)."})
        retries += 1
        if retries > f.max_retries:
            return _resolve_exhausted(f, transcript)
        transcript.append({"kind": "play", "text": f.timeout_message.strip()})
        return {"transcript": transcript, "resolved": {"action": "wait", "target": "", "label": "Waiting for input"}}

    # --------------------------------------------------------------- runtime
    async def is_open_now(self, f: IvrFlow, when: Optional[datetime] = None) -> bool:
        if not f.hours_enabled:
            return True
        try:
            tz = ZoneInfo(f.timezone)
        except Exception:
            tz = timezone.utc
        now = (when or datetime.now(timezone.utc)).astimezone(tz)
        windows = (f.hours or {}).get(_DAYS[now.weekday()], [])
        cur = now.time()
        for start, end in windows:
            if _parse_hhmm(start) <= cur <= _parse_hhmm(end):
                return True
        return False

    async def on_call_enter(self, call: Call) -> Dict[str, Any]:
        """Called from handle_pbx_event on a fresh inbound ring. Returns a
        directive dict the caller-facing side can act on."""
        f = await self.get_flow()
        assert f is not None
        if not f.is_active:
            return {"action": "queue", "reason": call.reason or "Inbound call"}

        if not await self.is_open_now(f):
            return await self._apply_terminal(
                call, f.after_hours_action, "", f.after_hours_message, note="after-hours"
            )

        call.ivr_state = {"menu": "main", "retries": 0, "path": ["main"]}
        call.reason = "In the phone menu"
        await self.db.commit()
        menu = (f.menus or {}).get("main", {})
        return {"action": "ivr_prompt", "prompt": f"{f.greeting}\n{menu.get('prompt', '')}".strip()}

    async def on_digit(self, call: Call, digit: str) -> Dict[str, Any]:
        f = await self.get_flow()
        assert f is not None
        st = dict(call.ivr_state or {"menu": "main", "retries": 0, "path": ["main"]})
        menu = (f.menus or {}).get(st["menu"], {})
        opt = next((o for o in menu.get("options", []) if o["digit"] == str(digit)), None)

        if not opt:
            st["retries"] = int(st.get("retries", 0)) + 1
            if st["retries"] > f.max_retries:
                return await self._apply_terminal(call, f.on_exhausted, "", note="menu retries exhausted")
            call.ivr_state = st
            await self.db.commit()
            return {"action": "ivr_reprompt", "prompt": f"{f.invalid_message}\n{menu.get('prompt', '')}".strip()}

        action, target = opt["action"], opt.get("target", "")
        if action == "submenu":
            if len(st.get("path", [])) >= _MAX_HOPS:
                return await self._apply_terminal(call, f.on_exhausted, "", note="menu too deep")
            st["menu"] = target
            st["retries"] = 0
            st.setdefault("path", []).append(target)
            call.ivr_state = st
            await self.db.commit()
            sub = (f.menus or {}).get(target, {})
            return {"action": "ivr_prompt", "prompt": sub.get("prompt", "")}
        if action == "repeat":
            return {"action": "ivr_prompt", "prompt": menu.get("prompt", "")}

        return await self._apply_terminal(call, action, target, note=f"chose {opt['label']}")

    async def on_timeout(self, call: Call) -> Dict[str, Any]:
        f = await self.get_flow()
        assert f is not None
        st = dict(call.ivr_state or {"menu": "main", "retries": 0})
        st["retries"] = int(st.get("retries", 0)) + 1
        if st["retries"] > f.max_retries:
            return await self._apply_terminal(call, f.on_exhausted, "", note="timeout — exhausted")
        call.ivr_state = st
        await self.db.commit()
        menu = (f.menus or {}).get(st["menu"], {})
        return {"action": "ivr_reprompt", "prompt": f"{f.timeout_message}\n{menu.get('prompt', '')}".strip()}

    # ------------------------------------------------------------- terminals
    async def _apply_terminal(
        self,
        call: Call,
        action: str,
        target: str,
        message: str = "",
        *,
        note: str,
    ) -> Dict[str, Any]:
        from app.services.telephony import TelephonyError, get_provider

        call.ivr_state = None

        if action in ("ring_all", "ring_agent"):
            call.state = CallState.QUEUED
            if action == "ring_agent" and target:
                agent = (
                    await self.db.execute(select(CallAgent).where(CallAgent.id == target))
                ).scalar_one_or_none()
                call.reason = f"Menu → {agent.name}" if agent else "Menu → agent"
            else:
                call.reason = "Menu → all agents"
            await self.db.commit()
            return {"action": "queue", "reason": call.reason}

        if action == "voicemail":
            call.state = CallState.ENDED
            call.outcome = CallOutcome.VOICEMAIL
            call.recorded = True
            call.ended_at = datetime.now(timezone.utc)
            call.reason = "Voicemail (from menu)"
            await self.db.commit()
            return {"action": "voicemail"}

        if action == "message":
            call.state = CallState.ENDED
            call.outcome = CallOutcome.COMPLETED
            call.ended_at = datetime.now(timezone.utc)
            call.reason = "Played a message"
            await self.db.commit()
            return {"action": "message", "text": message or target}

        if action == "transfer" and target:
            if call.provider_channel_id:
                try:
                    provider = await get_provider(self.db, self.workspace_id)
                    await provider.transfer(call.provider_channel_id, target)
                except TelephonyError:
                    pass
            call.state = CallState.ENDED
            call.outcome = CallOutcome.TRANSFERRED
            call.ended_at = datetime.now(timezone.utc)
            call.reason = f"Transferred to {target}"
            await self.db.commit()
            return {"action": "transfer", "target": target}

        # hangup / fallthrough
        call.state = CallState.ENDED
        call.outcome = CallOutcome.MISSED
        call.ended_at = datetime.now(timezone.utc)
        call.reason = f"Ended in menu ({note})"
        await self.db.commit()
        return {"action": "hangup"}


# ---------------------------------------------------------------- helpers
def _flow_dict(f: IvrFlow) -> Dict[str, Any]:
    return {
        "is_active": f.is_active,
        "greeting": f.greeting,
        "invalid_message": f.invalid_message,
        "timeout_message": f.timeout_message,
        "timeout_seconds": f.timeout_seconds,
        "max_retries": f.max_retries,
        "on_exhausted": f.on_exhausted,
        "menus": f.menus or {},
        "hours_enabled": f.hours_enabled,
        "timezone": f.timezone,
        "hours": f.hours or {},
        "after_hours_action": f.after_hours_action,
        "after_hours_message": f.after_hours_message,
    }


def _label_action(action: str, target: str, agents: Dict[str, str]) -> Dict[str, str]:
    labels = {
        "ring_all": "Ring all available agents",
        "ring_agent": f"Ring {agents.get(target, 'agent')}",
        "voicemail": "Send to voicemail",
        "message": f"Play a message: “{target}”",
        "transfer": f"Transfer the call to {target}",
        "hangup": "Hang up",
    }
    return {"action": action, "target": target, "label": labels.get(action, action)}


def _resolve_exhausted(f: IvrFlow, transcript: List[Dict[str, str]]) -> Dict[str, Any]:
    transcript.append({"kind": "note", "text": f"Retries exhausted → {f.on_exhausted}."})
    label = {"ring_all": "Ring all agents", "voicemail": "Send to voicemail", "hangup": "Hang up"}
    return {"transcript": transcript, "resolved": {"action": f.on_exhausted, "target": "", "label": label.get(f.on_exhausted, f.on_exhausted)}}


def _parse_hhmm(s: str) -> time:
    try:
        h, m = s.split(":")
        return time(int(h), int(m))
    except Exception:
        return time(0, 0)


def _validate_menus(menus: Any) -> Dict[str, Any]:
    if not isinstance(menus, dict) or "main" not in menus:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "menus must be an object with a 'main' menu")
    clean: Dict[str, Any] = {}
    for key, menu in menus.items():
        if not isinstance(key, str) or not key.strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "menu keys must be non-empty strings")
        if not isinstance(menu, dict):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"menu '{key}' must be an object")
        opts_in = menu.get("options", [])
        if not isinstance(opts_in, list) or not opts_in:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"menu '{key}' needs at least one option")
        seen = set()
        opts_out = []
        for o in opts_in:
            digit = str(o.get("digit", "")).strip()
            action = str(o.get("action", "")).strip()
            target = str(o.get("target", "") or "").strip()
            label = str(o.get("label", "") or "").strip() or action
            if digit not in _DIGITS:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"menu '{key}': '{digit}' is not a phone key")
            if digit in seen:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"menu '{key}': key {digit} used twice")
            if action not in ACTIONS:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"menu '{key}': unknown action '{action}'")
            if action in ("transfer", "message", "submenu", "ring_agent") and not target:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"menu '{key}' key {digit}: action '{action}' needs a target",
                )
            seen.add(digit)
            opts_out.append({"digit": digit, "label": label[:60], "action": action, "target": target[:200]})
        clean[key.strip()] = {"prompt": str(menu.get("prompt", "") or "").strip()[:600], "options": opts_out}

    # unreachable-submenu check
    reachable = {"main"}
    frontier = ["main"]
    while frontier:
        cur = frontier.pop()
        for o in clean[cur]["options"]:
            if o["action"] == "submenu" and o["target"] in clean and o["target"] not in reachable:
                reachable.add(o["target"])
                frontier.append(o["target"])
    orphans = set(clean) - reachable
    if orphans:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"these menus can never be reached: {sorted(orphans)}",
        )
    return clean


def _validate_hours(hours: Any) -> Dict[str, Any]:
    if not isinstance(hours, dict):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "hours must be an object keyed by weekday")
    clean: Dict[str, Any] = {}
    for day, windows in hours.items():
        if day not in _DAYS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"'{day}' is not a weekday (use {_DAYS})")
        if not isinstance(windows, list):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{day}: expected a list of [start, end] windows")
        out = []
        for w in windows:
            if not isinstance(w, (list, tuple)) or len(w) != 2:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{day}: each window must be [start, end]")
            start, end = str(w[0]), str(w[1])
            if _parse_hhmm(start) >= _parse_hhmm(end):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{day}: {start} must be before {end}")
            out.append([start, end])
        clean[day] = out
    return clean
