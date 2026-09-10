from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class QueuedCall(BaseModel):
    id: str
    name: str
    number: str
    reason: str
    waitedSec: int


class RecentCall(BaseModel):
    id: str
    name: str
    number: str
    direction: str
    outcome: str
    durationSec: int
    at: str
    recorded: bool


class ActiveCall(BaseModel):
    id: str
    name: str
    number: str
    direction: str
    startedAt: str
    ringing: bool = False   # dialled/answered-pending — the UI shows no timer yet
    muted: bool
    onHold: bool


class AgentRow(BaseModel):
    id: str
    name: str
    initials: str
    status: str
    callsToday: int
    isSelf: bool = False
    sipExtension: Optional[str] = None


class CallStats(BaseModel):
    callsToday: int
    callsDelta: float
    avgHandleSec: int
    ahtDelta: float
    answerRate: float
    answerDelta: float
    missed: int
    missedDelta: float


class VolumePoint(BaseModel):
    name: str
    Inbound: int
    Outbound: int


class IvrCall(BaseModel):
    id: str
    name: str
    number: str
    menu: str
    prompt: str = ""


class CallOverview(BaseModel):
    stats: CallStats
    queue: List[QueuedCall]
    recent: List[RecentCall]
    agents: List[AgentRow]
    volume: List[VolumePoint]
    active: Optional[ActiveCall] = None
    presence: str
    ivrCalls: List[IvrCall] = []


class CallPoll(BaseModel):
    queue: List[QueuedCall]
    active: Optional[ActiveCall] = None
    presence: str
    ivrCalls: List[IvrCall] = []


class DialRequest(BaseModel):
    name: str = ""
    number: str = Field(..., min_length=3, max_length=40)


class HangupRequest(BaseModel):
    outcome: str = "completed"


class FlagsRequest(BaseModel):
    muted: Optional[bool] = None
    on_hold: Optional[bool] = None


class PresenceRequest(BaseModel):
    status: str


class SoftphoneEvent(BaseModel):
    # inbound_ring | inbound_answered | outbound_answered | ended | declined
    kind: str = Field(..., max_length=32)
    number: Optional[str] = Field(default=None, max_length=40)
    name: Optional[str] = Field(default=None, max_length=200)


class SoftphoneConfig(BaseModel):
    configured: bool
    provider: str = "simulated"
    ws_url: Optional[str] = None
    domain: Optional[str] = None
    extension: Optional[str] = None
    password: Optional[str] = None
    display_name: Optional[str] = None
    # TURN relay so the browser's audio reaches the PBX even when direct
    # ICE fails (agent behind carrier-grade NAT, etc.)
    turn_url: Optional[str] = None
    turn_user: Optional[str] = None
    turn_password: Optional[str] = None


class AgentSipUpdate(BaseModel):
    sip_extension: Optional[str] = None
    sip_password: Optional[str] = None  # write-only; "" clears


class IvrOption(BaseModel):
    digit: str
    label: str = ""
    action: str
    target: str = ""


class IvrMenu(BaseModel):
    prompt: str = ""
    options: List[IvrOption] = []


class IvrFlowPayload(BaseModel):
    is_active: bool = False
    greeting: str = ""
    invalid_message: str = "Sorry, that isn't a valid option."
    timeout_message: str = "We didn't catch that."
    timeout_seconds: int = 7
    max_retries: int = 2
    on_exhausted: str = "ring_all"
    menus: Dict[str, IvrMenu] = {}
    hours_enabled: bool = False
    timezone: str = "Africa/Nairobi"
    hours: Dict[str, List[List[str]]] = {}
    after_hours_action: str = "voicemail"
    after_hours_message: str = ""


class IvrFlowUpdate(BaseModel):
    is_active: Optional[bool] = None
    greeting: Optional[str] = None
    invalid_message: Optional[str] = None
    timeout_message: Optional[str] = None
    timeout_seconds: Optional[int] = None
    max_retries: Optional[int] = None
    on_exhausted: Optional[str] = None
    menus: Optional[Dict[str, IvrMenu]] = None
    hours_enabled: Optional[bool] = None
    timezone: Optional[str] = None
    hours: Optional[Dict[str, List[List[str]]]] = None
    after_hours_action: Optional[str] = None
    after_hours_message: Optional[str] = None


class IvrSimulateRequest(BaseModel):
    digits: List[str] = Field(default_factory=list, max_length=20)


class IvrTranscriptLine(BaseModel):
    kind: str
    text: str


class IvrResolved(BaseModel):
    action: str
    target: str = ""
    label: str = ""


class IvrSimulateResult(BaseModel):
    transcript: List[IvrTranscriptLine]
    resolved: IvrResolved


class CallResult(BaseModel):
    """Generic mutation response — the fresh poll payload."""
    queue: List[QueuedCall]
    active: Optional[ActiveCall] = None
    presence: str
    recent: Optional[List[RecentCall]] = None
    stats: Optional[CallStats] = None
    agents: Optional[List[AgentRow]] = None
    volume: Optional[List[VolumePoint]] = None
