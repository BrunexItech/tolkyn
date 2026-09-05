from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class Upload(BaseModel):
    """A user-uploaded file (image / video / audio / doc) stored under /media/uploads."""

    __tablename__ = "uploads"

    kind = Column(String(16), nullable=False, default="file")  # image | video | audio | file
    url = Column(String(500), nullable=False)
    filename = Column(String(255), nullable=True)
    content_type = Column(String(120), nullable=True)
    size_bytes = Column(Integer, nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
