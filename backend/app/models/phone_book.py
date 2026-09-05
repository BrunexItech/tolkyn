from sqlalchemy import Column, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class PhoneBook(BaseModel):
    """A named category of saved phone numbers — e.g. "VIP", "Traders". The
    user names the category on creation/import. Numbers feed Bulk SMS."""

    __tablename__ = "phone_books"

    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(16), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    contacts = relationship(
        "PhoneBookContact",
        back_populates="phone_book",
        cascade="all, delete-orphan",
        order_by="PhoneBookContact.created_at.desc()",
    )
    owner = relationship("User", foreign_keys=[owner_id])


class PhoneBookContact(BaseModel):
    __tablename__ = "phone_book_contacts"
    # A number can live in several phone books (VIP *and* Traders) — that's
    # allowed — but never twice in the same one.
    __table_args__ = (
        UniqueConstraint("phone_book_id", "phone", name="uq_phonebook_phone"),
    )

    phone_book_id = Column(
        String(36), ForeignKey("phone_books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phone = Column(String(32), nullable=False, index=True)  # E.164
    name = Column(String(160), nullable=True)
    source = Column(String(16), nullable=False, default="manual")  # csv | lead | manual
    workspace_id = Column(String(36), nullable=False, index=True)

    phone_book = relationship("PhoneBook", back_populates="contacts")
