import uuid

from app.services.telephony.base import PlacedCall, SipCredentials, TelephonyProvider


class SimulatedProvider:
    """No PBX configured — the Call Center keeps working with fake calls so
    the product is demonstrable before a trunk is wired."""

    name = "simulated"

    async def place_call(self, from_extension: str, to_number: str) -> PlacedCall:  # noqa: ARG002
        return PlacedCall(channel_id=f"sim_{uuid.uuid4().hex[:12]}", provider="simulated")

    async def hangup(self, channel_id):  # noqa: ARG002, D102
        return None

    async def transfer(self, channel_id, to_extension):  # noqa: ARG002, D102
        return None

    def sip_credentials(self, extension, password, display_name) -> SipCredentials:  # noqa: ARG002
        return SipCredentials(configured=False)


_provider: TelephonyProvider = SimulatedProvider()
