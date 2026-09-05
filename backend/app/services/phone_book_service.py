"""Phone Book — named categories of saved numbers (VIP, Traders, …) that feed
Bulk SMS. Numbers can come from a CSV, from Leads, or be typed manually. A
number is unique within a book; it may appear in several books, and when it
does we surface that so the user can decide to keep or remove it."""
import re
from typing import Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lead import Lead
from app.models.phone_book import PhoneBook, PhoneBookContact
from app.services.messaging_provider import normalize_phone


def _digits(p: str) -> str:
    return re.sub(r"\D", "", p or "")


class PhoneBookService:
    def __init__(self, db: AsyncSession, workspace_id: str, user_id: str | None = None):
        self.db = db
        self.workspace_id = workspace_id
        self.user_id = user_id or workspace_id

    # ------------------------------------------------------------- books
    async def list(self) -> List[Dict[str, Any]]:
        rows = await self.db.execute(
            select(PhoneBook, func.count(PhoneBookContact.id))
            .outerjoin(PhoneBookContact, PhoneBookContact.phone_book_id == PhoneBook.id)
            .where(PhoneBook.workspace_id == self.workspace_id)
            .group_by(PhoneBook.id)
            .order_by(PhoneBook.created_at.desc())
        )
        out: List[Dict[str, Any]] = []
        for book, count in rows.all():
            out.append({
                "id": book.id, "name": book.name, "description": book.description,
                "color": book.color, "contact_count": count,
                "created_at": book.created_at, "updated_at": book.updated_at,
            })
        return out

    async def _get(self, book_id: str) -> PhoneBook:
        res = await self.db.execute(
            select(PhoneBook)
            .options(selectinload(PhoneBook.contacts))
            .where(PhoneBook.id == book_id, PhoneBook.workspace_id == self.workspace_id)
        )
        book = res.scalar_one_or_none()
        if not book:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Phone book not found")
        return book

    async def get_detail(self, book_id: str) -> Dict[str, Any]:
        book = await self._get(book_id)
        # Which of this book's numbers also live in another book?
        others = await self.db.execute(
            select(PhoneBookContact.phone)
            .where(
                PhoneBookContact.workspace_id == self.workspace_id,
                PhoneBookContact.phone_book_id != book_id,
            )
        )
        elsewhere = {p for (p,) in others.all()}
        return {
            "id": book.id, "name": book.name, "description": book.description,
            "color": book.color, "contact_count": len(book.contacts),
            "created_at": book.created_at, "updated_at": book.updated_at,
            "contacts": [
                {
                    "id": c.id, "phone": c.phone, "name": c.name, "source": c.source,
                    "created_at": c.created_at,
                    "also_in_other_books": c.phone in elsewhere,
                }
                for c in book.contacts
            ],
        }

    async def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give the phone book a name")
        dup = await self.db.execute(
            select(PhoneBook).where(
                PhoneBook.workspace_id == self.workspace_id, func.lower(PhoneBook.name) == name.lower()
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status.HTTP_409_CONFLICT, f'A phone book called "{name}" already exists')
        book = PhoneBook(
            name=name,
            description=(data.get("description") or "").strip() or None,
            color=data.get("color"),
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(book)
        await self.db.commit()
        await self.db.refresh(book)
        return {
            "id": book.id, "name": book.name, "description": book.description, "color": book.color,
            "contact_count": 0, "created_at": book.created_at, "updated_at": book.updated_at,
        }

    async def update(self, book_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        book = await self._get(book_id)
        if patch.get("name"):
            book.name = patch["name"].strip()
        if "description" in patch:
            book.description = (patch["description"] or "").strip() or None
        if "color" in patch:
            book.color = patch["color"]
        await self.db.commit()
        return await self.get_detail(book_id)

    async def delete(self, book_id: str) -> None:
        book = await self._get(book_id)
        await self.db.delete(book)
        await self.db.commit()

    # ---------------------------------------------------------- contacts
    async def add_contacts(
        self, book_id: str, contacts: List[Dict[str, Any]], lead_ids: List[str] | None = None
    ) -> Dict[str, Any]:
        book = await self._get(book_id)

        incoming: List[Dict[str, Any]] = list(contacts or [])
        if lead_ids:
            leads = await self.db.execute(
                select(Lead).where(
                    Lead.workspace_id == self.workspace_id, Lead.id.in_(list(lead_ids))
                )
            )
            for l in leads.scalars().all():
                incoming.append({"phone": l.phone or "", "name": l.name, "source": "lead"})

        existing_here = {c.phone for c in book.contacts}
        # Numbers already in ANY other book in this workspace.
        others = await self.db.execute(
            select(PhoneBookContact.phone).where(
                PhoneBookContact.workspace_id == self.workspace_id,
                PhoneBookContact.phone_book_id != book_id,
            )
        )
        in_other_books = {p for (p,) in others.all()}

        added = skipped_dupe = skipped_invalid = 0
        dupe_phones: List[str] = []
        cross_phones: List[str] = []
        seen_this_batch: set[str] = set()

        for raw in incoming:
            phone = normalize_phone(str(raw.get("phone", "")))
            if not phone:
                skipped_invalid += 1
                continue
            if phone in existing_here or phone in seen_this_batch:
                skipped_dupe += 1
                if phone not in dupe_phones:
                    dupe_phones.append(phone)
                continue
            seen_this_batch.add(phone)
            src = (raw.get("source") or "manual")
            if src not in ("csv", "lead", "manual"):
                src = "manual"
            self.db.add(PhoneBookContact(
                phone_book_id=book.id,
                phone=phone,
                name=(raw.get("name") or "").strip() or None,
                source=src,
                workspace_id=self.workspace_id,
            ))
            added += 1
            if phone in in_other_books:
                cross_phones.append(phone)

        await self.db.commit()
        return {
            "added": added,
            "skipped_duplicate": skipped_dupe,
            "skipped_invalid": skipped_invalid,
            "duplicate_phones": dupe_phones,
            "cross_book_phones": cross_phones,
        }

    async def remove_contact(self, book_id: str, contact_id: str) -> None:
        res = await self.db.execute(
            select(PhoneBookContact).where(
                PhoneBookContact.id == contact_id,
                PhoneBookContact.phone_book_id == book_id,
                PhoneBookContact.workspace_id == self.workspace_id,
            )
        )
        c = res.scalar_one_or_none()
        if not c:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
        await self.db.delete(c)
        await self.db.commit()

    # ---------------------------------------- recipients for Bulk SMS
    async def recipients_for(self, book_ids: List[str]) -> List[Dict[str, Any]]:
        if not book_ids:
            return []
        res = await self.db.execute(
            select(PhoneBookContact).where(
                PhoneBookContact.workspace_id == self.workspace_id,
                PhoneBookContact.phone_book_id.in_(list(book_ids)),
            )
        )
        seen: set[str] = set()
        out: List[Dict[str, Any]] = []
        for c in res.scalars().all():
            if c.phone in seen:
                continue
            seen.add(c.phone)
            out.append({"name": c.name, "phone": c.phone, "source": "phonebook"})
        return out

    # ---------------------------------------- duplicates-across-books report
    async def duplicates_report(self) -> List[Dict[str, Any]]:
        res = await self.db.execute(
            select(PhoneBookContact.phone, PhoneBookContact.name, PhoneBook.name)
            .join(PhoneBook, PhoneBook.id == PhoneBookContact.phone_book_id)
            .where(PhoneBookContact.workspace_id == self.workspace_id)
        )
        by_phone: Dict[str, Dict[str, Any]] = {}
        for phone, cname, book_name in res.all():
            entry = by_phone.setdefault(phone, {"phone": phone, "name": cname, "books": []})
            if book_name not in entry["books"]:
                entry["books"].append(book_name)
            if not entry["name"] and cname:
                entry["name"] = cname
        return [v for v in by_phone.values() if len(v["books"]) > 1]
