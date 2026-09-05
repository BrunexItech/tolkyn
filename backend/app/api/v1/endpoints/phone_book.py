from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.core.security import get_current_user_id
from app.db import get_db
from app.schemas.messaging import CsvImportResult
from app.schemas.phone_book import (
    PhoneBookAddContacts,
    PhoneBookAddResult,
    PhoneBookCreate,
    PhoneBookDetail,
    PhoneBookDuplicatesReport,
    PhoneBookList,
    PhoneBookResponse,
    PhoneBookUpdate,
)
from app.services.messaging_service import parse_contacts_csv
from app.services.phone_book_service import PhoneBookService

router = APIRouter()


def _svc(db: AsyncSession, workspace_id: str, user_id: str) -> PhoneBookService:
    return PhoneBookService(db, workspace_id, user_id)


@router.get("", response_model=PhoneBookList)
async def list_phone_books(
    workspace_id: str = Depends(get_workspace_id), db: AsyncSession = Depends(get_db)
):
    items = await PhoneBookService(db, workspace_id).list()
    return PhoneBookList(items=[PhoneBookResponse(**i) for i in items])


@router.post("", response_model=PhoneBookResponse, status_code=status.HTTP_201_CREATED)
async def create_phone_book(
    body: PhoneBookCreate,
    workspace_id: str = Depends(get_workspace_id),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return PhoneBookResponse(**await _svc(db, workspace_id, user_id).create(body.model_dump()))


@router.get("/duplicates", response_model=PhoneBookDuplicatesReport)
async def phone_book_duplicates(
    workspace_id: str = Depends(get_workspace_id), db: AsyncSession = Depends(get_db)
):
    items = await PhoneBookService(db, workspace_id).duplicates_report()
    return PhoneBookDuplicatesReport(items=items)


@router.post("/parse-csv", response_model=CsvImportResult)
async def parse_csv(
    file: UploadFile = File(...),
    _: str = Depends(get_workspace_id),
):
    raw = await file.read()
    if len(raw) > 5_000_000:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 5 MB)")
    return CsvImportResult(**parse_contacts_csv(raw))


@router.get("/{book_id}", response_model=PhoneBookDetail)
async def get_phone_book(
    book_id: str, workspace_id: str = Depends(get_workspace_id), db: AsyncSession = Depends(get_db)
):
    return PhoneBookDetail(**await PhoneBookService(db, workspace_id).get_detail(book_id))


@router.patch("/{book_id}", response_model=PhoneBookDetail)
async def update_phone_book(
    book_id: str,
    body: PhoneBookUpdate,
    workspace_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return PhoneBookDetail(
        **await PhoneBookService(db, workspace_id).update(book_id, body.model_dump(exclude_unset=True))
    )


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phone_book(
    book_id: str, workspace_id: str = Depends(get_workspace_id), db: AsyncSession = Depends(get_db)
):
    await PhoneBookService(db, workspace_id).delete(book_id)


@router.post("/{book_id}/contacts", response_model=PhoneBookAddResult)
async def add_contacts(
    book_id: str,
    body: PhoneBookAddContacts,
    workspace_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return PhoneBookAddResult(
        **await PhoneBookService(db, workspace_id).add_contacts(
            book_id, [c.model_dump() for c in body.contacts], body.lead_ids
        )
    )


@router.delete("/{book_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_contact(
    book_id: str,
    contact_id: str,
    workspace_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await PhoneBookService(db, workspace_id).remove_contact(book_id, contact_id)
