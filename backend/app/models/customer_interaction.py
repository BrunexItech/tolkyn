from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class CustomerInteraction(BaseModel):
    """One logged touchpoint with a customer — a call, email, WhatsApp, SMS,
    meeting or a plain note. Feeds the customer timeline and keeps
    `Customer.last_contact_at` current."""

    __tablename__ = "customer_interactions"

    customer_id = Column(
        String(36), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind = Column(String(20), nullable=False)          # call | email | whatsapp | sms | meeting | note
    direction = Column(String(10), nullable=True)      # in | out (irrelevant for note/meeting)
    note = Column(Text, nullable=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    customer = relationship("Customer", backref="interactions")
