"""Seed a believable call-center state on first use (no live telephony yet)."""
from datetime import datetime, timedelta, timezone
from typing import List

from app.models.call import (
    Call,
    CallAgent,
    CallDirection,
    CallOutcome,
    CallState,
    AgentStatus,
)

_NOW = lambda m: datetime.now(timezone.utc) - timedelta(minutes=m)  # noqa: E731


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "??"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


_RECENT = [
    ("Rachel Ferns", "+1 206 555 0112", CallDirection.INBOUND, CallOutcome.COMPLETED, 486, 12),
    ("Northwind Ltd", "+1 917 555 0130", CallDirection.OUTBOUND, CallOutcome.COMPLETED, 812, 41),
    ("Unknown caller", "+1 312 555 0176", CallDirection.INBOUND, CallOutcome.MISSED, 0, 63),
    ("Elena Popov", "+49 30 5557 0021", CallDirection.INBOUND, CallOutcome.VOICEMAIL, 47, 96),
    ("Kwame Mensah", "+233 30 555 0198", CallDirection.OUTBOUND, CallOutcome.TRANSFERRED, 203, 140),
    ("Lucia Romano", "+39 06 5557 0044", CallDirection.INBOUND, CallOutcome.COMPLETED, 634, 188),
    ("Priya's referral", "+1 415 555 0170", CallDirection.OUTBOUND, CallOutcome.COMPLETED, 355, 240),
    ("Unknown caller", "+44 20 7946 0080", CallDirection.INBOUND, CallOutcome.MISSED, 0, 300),
]

_QUEUE = [
    ("Dana Whitfield", "+1 415 555 0148", "Billing question", 74),
    ("Marcus Lund", "+44 20 7946 0991", "Integration help", 39),
    ("Unknown caller", "+1 312 555 0176", "New inquiry", 12),
]

# fallback roster when the workspace has no extra teammates yet
_FALLBACK_AGENTS = [
    ("Priya Nair", AgentStatus.ON_CALL, 22),
    ("Diego Alvarez", AgentStatus.AVAILABLE, 17),
    ("Sofia Kelly", AgentStatus.AWAY, 9),
    ("Tom Becker", AgentStatus.OFFLINE, 0),
]


def build_calls(workspace_id: str, user_id: str) -> List[Call]:
    calls: List[Call] = []
    for name, number, direction, outcome, dur, ago in _RECENT:
        started = _NOW(ago)
        calls.append(
            Call(
                direction=direction,
                state=CallState.ENDED,
                outcome=outcome,
                contact_name=name,
                number=number,
                recorded=outcome in (CallOutcome.COMPLETED, CallOutcome.TRANSFERRED),
                queued_at=started if direction == CallDirection.INBOUND else None,
                started_at=started if dur else None,
                ended_at=started + timedelta(seconds=dur),
                duration_sec=dur,
                agent_id=user_id,
                workspace_id=workspace_id,
            )
        )
    for name, number, reason, waited in _QUEUE:
        calls.append(
            Call(
                direction=CallDirection.INBOUND,
                state=CallState.QUEUED,
                contact_name=name,
                number=number,
                reason=reason,
                queued_at=datetime.now(timezone.utc) - timedelta(seconds=waited),
                workspace_id=workspace_id,
            )
        )
    return calls


def build_agents(workspace_id: str, user_id: str, self_name: str, teammates: List[str]) -> List[CallAgent]:
    agents: List[CallAgent] = [
        CallAgent(
            name=self_name or "You",
            initials=_initials(self_name or "You"),
            status=AgentStatus.AVAILABLE,
            calls_today=0,
            is_self=True,
            user_id=user_id,
            workspace_id=workspace_id,
        )
    ]
    roster = [(t, None, None) for t in teammates] if teammates else _FALLBACK_AGENTS
    presets = {n: (s, c) for n, s, c in _FALLBACK_AGENTS}
    for name, status, calls in roster:
        st, ct = (status, calls)
        if st is None:
            st, ct = presets.get(name, (AgentStatus.AVAILABLE, 0))
        agents.append(
            CallAgent(
                name=name,
                initials=_initials(name),
                status=st,
                calls_today=ct or 0,
                is_self=False,
                workspace_id=workspace_id,
            )
        )
    return agents
