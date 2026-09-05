from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
import enum

from app.db.base import BaseModel


class EmailAccountType(str, enum.Enum):
    SMTP = "smtp"
    API = "api"  # Resend / SendGrid / Postmark (future)


class EmailAccount(BaseModel):
    """A sending identity (business email) owned by one workspace."""

    __tablename__ = "email_accounts"

    label = Column(String(120), nullable=False)
    type = Column(Enum(EmailAccountType), nullable=False, default=EmailAccountType.SMTP)

    from_name = Column(String(120), nullable=False)
    from_email = Column(String(255), nullable=False)
    reply_to = Column(String(255), nullable=True)

    # SMTP
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, nullable=True, default=587)
    smtp_username = Column(String(255), nullable=True)
    smtp_password_enc = Column(Text, nullable=True)  # Fernet-encrypted
    use_tls = Column(Boolean, nullable=False, default=True)  # STARTTLS on 587
    use_ssl = Column(Boolean, nullable=False, default=False)  # implicit TLS on 465

    # API provider (future)
    api_provider = Column(String(40), nullable=True)
    api_key_enc = Column(Text, nullable=True)

    signature = Column(Text, nullable=True)

    is_default = Column(Boolean, nullable=False, default=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)

    daily_limit = Column(Integer, nullable=False, default=200)
    sent_today = Column(Integer, nullable=False, default=0)
    sent_today_date = Column(String(10), nullable=True)  # YYYY-MM-DD
    sent_total = Column(Integer, nullable=False, default=0)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])

    def __repr__(self) -> str:
        return f"<EmailAccount {self.from_email} ws={self.workspace_id}>"
