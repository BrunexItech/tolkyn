"""Creates the real "self" agent row (and any real teammates) a workspace
needs the first time the Call Center is opened. No fake/demo calls or
placeholder agents are seeded here -- a brand-new workspace with no real
call activity yet shows a genuinely empty history, not fabricated ones."""
from typing import List

from app.models.call import AgentStatus, CallAgent


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "??"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


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
    for name in teammates:
        agents.append(
            CallAgent(
                name=name,
                initials=_initials(name),
                status=AgentStatus.AVAILABLE,
                calls_today=0,
                is_self=False,
                workspace_id=workspace_id,
            )
        )
    return agents
