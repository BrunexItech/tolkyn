import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String

from app.db.base import BaseModel


class VoiceCallJobStatus(str, enum.Enum):
    QUEUED = "queued"          # created, waiting for ami-bridge.py to pick it up
    DISPATCHED = "dispatched"  # AMI Originate sent -- doesn't yet mean HUMAN
                                # picked up or heard the message, see note below
    FAILED = "failed"          # couldn't fetch audio / originate at all


class VoiceCallJob(BaseModel):
    """One outbound call for a Voice Broadcast -- queued here by
    MessagingService, picked up and originated by the host's ami-bridge.py
    (the only thing with a live AMI connection to Asterisk; see its
    _voice_broadcast_loop). AMD (Answering Machine Detection) runs in the
    dialplan itself (see extensions.conf.template's [voice-broadcast]
    context) -- the message only plays if a real person answers.

    v1 only tracks whether the call was *dispatched* to Asterisk, not its
    true outcome (answered/AMD result/played) -- that would need
    correlating AMI hangup events back to this row, not yet wired up.
    """

    __tablename__ = "voice_call_jobs"

    workspace_id = Column(String(36), nullable=False, index=True)
    broadcast_id = Column(String(36), ForeignKey("broadcasts.id"), nullable=False, index=True)

    phone = Column(String(40), nullable=False)
    caller_id = Column(String(40), nullable=True)
    # media-relative path from ivr_tts.render_and_cache(), e.g. "ivr-audio/<hash>.wav"
    audio_rel_path = Column(String(255), nullable=False)

    status = Column(Enum(VoiceCallJobStatus), nullable=False, default=VoiceCallJobStatus.QUEUED)
    error = Column(String(500), nullable=True)
    dispatched_at = Column(DateTime(timezone=True), nullable=True)
