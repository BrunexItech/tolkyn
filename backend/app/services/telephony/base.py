"""Provider-agnostic telephony interface. The Call Center service talks only
to this; swapping CloudOne for another SIP provider later means one new
subclass and one row in `telephony_configs`, no changes anywhere else."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


class TelephonyError(Exception):
    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class PlacedCall:
    channel_id: Optional[str]        # the PBX's id for this call leg
    provider: str


@dataclass
class SipCredentials:
    configured: bool
    ws_url: Optional[str] = None
    domain: Optional[str] = None
    extension: Optional[str] = None
    password: Optional[str] = None
    display_name: Optional[str] = None
    turn_url: Optional[str] = None
    turn_user: Optional[str] = None
    turn_password: Optional[str] = None


class TelephonyProvider(Protocol):
    name: str

    async def place_call(self, from_extension: str, to_number: str) -> PlacedCall: ...

    async def hangup(self, channel_id: Optional[str]) -> None: ...

    async def transfer(self, channel_id: Optional[str], to_extension: str) -> None: ...

    def sip_credentials(self, extension: Optional[str], password: Optional[str], display_name: str) -> SipCredentials: ...
