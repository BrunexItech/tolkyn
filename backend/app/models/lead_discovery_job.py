import enum

from sqlalchemy import Column, DateTime, Enum, String, JSON

from app.db.base import BaseModel


class LeadDiscoveryJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class LeadDiscoveryJob(BaseModel):
    """A Lead Discovery run, tracked so the POST that starts it can return
    immediately instead of holding the HTTP connection open for the whole
    search -- scanning real external sites plus several AI calls routinely
    ran past Cloudflare's own ~100s proxy timeout (confirmed via response
    headers: this site is behind Cloudflare), surfacing as a 504 to the
    caller no matter how the backend's own work was tuned. The frontend
    polls GET /leads/discover/{id} instead, which is never at risk of a
    proxy timeout since each poll is a fast, separate request."""

    __tablename__ = "lead_discovery_jobs"

    workspace_id = Column(String(36), nullable=False, index=True)
    request = Column(JSON, nullable=False)  # the original LeadDiscoverRequest, as a dict
    status = Column(Enum(LeadDiscoveryJobStatus), nullable=False, default=LeadDiscoveryJobStatus.QUEUED)
    result = Column(JSON, nullable=True)  # the LeadDiscoverResponse payload, once done
    error = Column(String(500), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
