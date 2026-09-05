from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class PhoneBookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    color: Optional[str] = Field(None, max_length=16)


class PhoneBookUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    color: Optional[str] = Field(None, max_length=16)


class PhoneBookContactIn(BaseModel):
    phone: str
    name: Optional[str] = None
    source: Optional[str] = "manual"


class PhoneBookAddContacts(BaseModel):
    contacts: List[PhoneBookContactIn] = Field(default_factory=list)
    lead_ids: List[str] = Field(default_factory=list)


class PhoneBookContactRow(BaseModel):
    id: str
    phone: str
    name: Optional[str] = None
    source: str
    created_at: datetime
    # True when this exact number also sits in at least one other phone book.
    also_in_other_books: bool = False

    model_config = {"from_attributes": True}


class PhoneBookResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    contact_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PhoneBookDetail(PhoneBookResponse):
    contacts: List[PhoneBookContactRow] = []


class PhoneBookList(BaseModel):
    items: List[PhoneBookResponse]


class PhoneBookAddResult(BaseModel):
    added: int
    skipped_duplicate: int          # already in THIS phone book
    skipped_invalid: int            # not a usable phone number
    duplicate_phones: List[str] = []  # the ones skipped as duplicates
    cross_book_phones: List[str] = []  # added, but ALSO present in another book — flag for the user


class DuplicateAcrossBooks(BaseModel):
    phone: str
    name: Optional[str] = None
    books: List[str]  # phone book names this number appears in


class PhoneBookDuplicatesReport(BaseModel):
    items: List[DuplicateAcrossBooks]
