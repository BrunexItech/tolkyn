from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
import enum

from app.db.base import BaseModel


class ThreadKind(str, enum.Enum):
    COMMENT = "comment"
    MENTION = "mention"
    DM = "dm"
    REVIEW = "review"


class ThreadStatus(str, enum.Enum):
    OPEN = "open"
    SNOOZED = "snoozed"
    DONE = "done"


class InboxThread(BaseModel):
    __tablename__ = "inbox_threads"

    platform = Column(String(30), nullable=False)
    kind = Column(Enum(ThreadKind), nullable=False, default=ThreadKind.COMMENT)
    status = Column(Enum(ThreadStatus), nullable=False, default=ThreadStatus.OPEN)

    author_name = Column(String(160), nullable=False)
    author_handle = Column(String(160), nullable=True)
    author_avatar = Column(String(500), nullable=True)

    context = Column(String(400), nullable=True)   # "on your post: 'New feature drop'"
    permalink = Column(String(500), nullable=True)
    sentiment = Column(String(16), nullable=True)  # positive / neutral / negative
    priority = Column(Integer, nullable=False, default=0)

    source = Column(String(16), nullable=False, default="manual")  # upload_post | seed | manual
    external_id = Column(String(200), nullable=True, index=True)    # stable key for provider syncs
    ref = Column(JSON, nullable=True)                               # {post_id, comment_id, dm_recipient_id}

    unread = Column(Integer, nullable=False, default=1)
    last_message_at = Column(DateTime(timezone=True), nullable=True)

    assignee = Column(String(36), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
    messages = relationship(
        "InboxMessage", back_populates="thread", cascade="all, delete-orphan", order_by="InboxMessage.created_at"
    )


class InboxMessage(BaseModel):
    __tablename__ = "inbox_messages"

    thread_id = Column(String(36), ForeignKey("inbox_threads.id", ondelete="CASCADE"), nullable=False, index=True)
    direction = Column(String(8), nullable=False, default="in")  # in | out
    author_name = Column(String(160), nullable=False)
    body = Column(Text, nullable=False)
    via = Column(String(16), nullable=True)  # manual | ai
    at = Column(DateTime(timezone=True), nullable=True)
    external_id = Column(String(200), nullable=True, index=True)
    like_count = Column(Integer, nullable=True)  # from the platform, when it reports one

    thread = relationship("InboxThread", back_populates="messages")
