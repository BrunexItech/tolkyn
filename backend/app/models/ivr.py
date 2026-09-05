from sqlalchemy import Boolean, Column, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import BaseModel


class IvrFlow(BaseModel):
    """The inbound call-flow (auto-attendant / IVR) for one workspace.

    One row per workspace. The `menus` blob holds the whole tree so the shape
    can evolve without migrations; `IvrService` validates it on every save so
    what the caller hears is never guesswork.

    menus = {
      "main": {
        "prompt": "Thanks for calling Acme. Press 1 for sales, 2 for support.",
        "options": [
          {"digit": "1", "label": "Sales",   "action": "ring_all",  "target": ""},
          {"digit": "2", "label": "Support", "action": "submenu",   "target": "support"},
          {"digit": "9", "label": "Voicemail","action": "voicemail","target": ""}
        ]
      },
      "support": { "prompt": "...", "options": [ ... ] }
    }

    action ∈ ring_all | ring_agent | submenu | voicemail | message | transfer | hangup | repeat
      ring_agent  -> target = CallAgent.id
      submenu     -> target = key in menus
      transfer    -> target = external number (E.164)
      message     -> target = text to read out, then hang up
    """

    __tablename__ = "ivr_flows"

    workspace_id = Column(String(36), nullable=False, unique=True, index=True)
    is_active = Column(Boolean, nullable=False, default=False)

    greeting = Column(Text, nullable=False, default="")
    invalid_message = Column(
        Text, nullable=False, default="Sorry, that isn't a valid option."
    )
    timeout_message = Column(
        Text, nullable=False, default="We didn't catch that."
    )
    timeout_seconds = Column(Integer, nullable=False, default=7)
    max_retries = Column(Integer, nullable=False, default=2)
    # what happens once retries are exhausted: ring_all | voicemail | hangup
    on_exhausted = Column(String(20), nullable=False, default="ring_all")

    menus = Column(JSONB, nullable=False, default=dict)

    # Business hours — when enabled and the call lands outside them, the caller
    # gets `after_hours_action` straight away instead of the menu.
    hours_enabled = Column(Boolean, nullable=False, default=False)
    timezone = Column(String(64), nullable=False, default="Africa/Nairobi")
    hours = Column(JSONB, nullable=False, default=dict)  # {"mon": [["09:00","17:00"]], ...}
    after_hours_action = Column(String(20), nullable=False, default="voicemail")
    after_hours_message = Column(
        Text,
        nullable=False,
        default="Thanks for calling. Our office is closed right now — please leave a message.",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<IvrFlow ws={self.workspace_id} active={self.is_active}>"
