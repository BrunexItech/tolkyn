from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.email_account import (
    EmailAccountCreate,
    EmailAccountList,
    EmailAccountResponse,
    EmailAccountUpdate,
    TestEmailRequest,
    TestEmailResult,
)
from app.services.email_account_service import EmailAccountService

router = APIRouter()


@router.get("", response_model=EmailAccountList)
async def list_accounts(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return EmailAccountList(items=await EmailAccountService(db, user_id).list())


@router.post("", response_model=EmailAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    data: EmailAccountCreate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await EmailAccountService(db, user_id).create(data)


@router.get("/{account_id}", response_model=EmailAccountResponse)
async def get_account(
    account_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await EmailAccountService(db, user_id).get(account_id)


@router.patch("/{account_id}", response_model=EmailAccountResponse)
async def update_account(
    account_id: str,
    data: EmailAccountUpdate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await EmailAccountService(db, user_id).update(account_id, data)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await EmailAccountService(db, user_id).delete(account_id)


@router.post("/{account_id}/test", response_model=TestEmailResult)
async def test_account(
    account_id: str,
    body: TestEmailRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    ok, message = await EmailAccountService(db, user_id).test(
        account_id, str(body.to_email) if body.to_email else None
    )
    return TestEmailResult(ok=ok, message=message)
