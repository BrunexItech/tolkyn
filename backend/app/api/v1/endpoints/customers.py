from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.core.actor import get_workspace_id
from app.schemas.customer import (
    CustomerCreate,
    CustomerInteractionList,
    CustomerListResponse,
    CustomerResponse,
    CustomerSummary,
    CustomerUpdate,
    LogContactRequest,
)
from app.services.customer_service import CustomerService

router = APIRouter()


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    stage: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = Query(None, min_length=1),
    not_contacted_days: Optional[int] = Query(None, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    service = CustomerService(db, user_id)
    items, total = await service.list(
        stage=stage,
        status_filter=status,
        source=source,
        search=search,
        not_contacted_days=not_contacted_days,
        limit=limit,
        offset=offset,
    )
    return CustomerListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/summary", response_model=CustomerSummary)
async def customer_summary(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await CustomerService(db, user_id).summary()


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    data: CustomerCreate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await CustomerService(db, user_id).create(data)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await CustomerService(db, user_id).get(customer_id)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: str,
    data: CustomerUpdate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await CustomerService(db, user_id).update(customer_id, data)


@router.post("/{customer_id}/log-contact", response_model=CustomerResponse)
async def log_customer_contact(
    customer_id: str,
    body: Optional[LogContactRequest] = None,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await CustomerService(db, user_id).log_contact(customer_id, body or LogContactRequest())


@router.get("/{customer_id}/interactions", response_model=CustomerInteractionList)
async def list_customer_interactions(
    customer_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return CustomerInteractionList(
        items=await CustomerService(db, user_id).list_interactions(customer_id)
    )


@router.delete(
    "/{customer_id}/interactions/{interaction_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_customer_interaction(
    customer_id: str,
    interaction_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await CustomerService(db, user_id).delete_interaction(customer_id, interaction_id)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await CustomerService(db, user_id).delete(customer_id)
