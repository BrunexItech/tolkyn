import enum

from sqlalchemy import JSON, Boolean, Column, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class VideoJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class VideoJob(BaseModel):
    """One Veo 3.1 generation request. Generation is asynchronous (Gemini's
    long-running operation, ~1-2 minutes) — a row is created as QUEUED right
    away and the background scheduler (see services/video_service.py +
    services/scheduler.py) polls it through to SUCCEEDED/FAILED."""

    __tablename__ = "video_jobs"

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    model_key = Column(String(40), nullable=False)  # see app.core.video_models.VEO_MODELS
    prompt = Column(Text, nullable=False)
    negative_prompt = Column(Text, nullable=True)
    aspect_ratio = Column(String(10), nullable=False, default="16:9")
    resolution = Column(String(10), nullable=False, default="1080p")
    duration_seconds = Column(Integer, nullable=False, default=8)
    generate_audio = Column(Boolean, nullable=False, default=True)
    reference_image_url = Column(String(500), nullable=True)  # /media/... used as first-frame image-to-video
    brand_logo_url = Column(String(500), nullable=True)  # /media/... shown to the user, colors guide styling
    brand_colors = Column(JSON, nullable=True)  # hex strings extracted from the logo
    # opt-in: where in the scene to place the real logo — a branded first
    # frame is generated and used as the image-to-video reference.
    hero_logo_where = Column(String(200), nullable=True)

    # For clips longer than Veo's ~8s native limit: the job is produced as
    # back-to-back segments and stitched. segment_plan is the list of segment
    # durations; segment_index is the one currently generating.
    segment_plan = Column(JSON, nullable=True)
    segment_index = Column(Integer, nullable=False, default=0)
    segment_paths = Column(JSON, nullable=False, default=list)  # /media/... per finished segment
    continuation_frame_url = Column(String(500), nullable=True)  # last frame of the previous segment

    status = Column(Enum(VideoJobStatus), nullable=False, default=VideoJobStatus.QUEUED)
    operation_name = Column(String(300), nullable=True)  # Gemini operation, for polling
    video_url = Column(String(500), nullable=True)        # local /media/... once downloaded
    thumbnail_url = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    cost_usd = Column(Float, nullable=False, default=0.0)

    owner = relationship("User", foreign_keys=[owner_id])

    def __repr__(self) -> str:
        return f"<VideoJob {self.id} {self.status}>"
