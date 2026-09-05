from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.core.actor import get_workspace_id
from app.schemas.lead import (
    LeadCreate,
    LeadUpdate,
    LeadResponse,
    LeadListResponse,
    LeadSummaryResponse,
    LeadBulkAction,
    LeadStatusCount,
    LeadSourceCount,
    LeadGenerateRequest,
    LeadGenerateResponse,
    LeadGenerateStats,
    LeadDiscoverRequest,
    LeadDiscoverResponse,
    LeadDiscoverStats,
    LeadOutreachRequest,
    LeadOutreach,
)
from app.schemas.customer import ConvertLeadRequest, CustomerResponse
from app.schemas.email_account import (
    BulkSendRequest,
    BulkSendResult,
    SendOutreachRequest,
    SendResult,
)
from app.services.lead_service import LeadService
from app.services.lead_pipeline import LeadPipeline
from app.services.lead_discovery import LeadDiscovery
from app.services.geo_service import GeoService
from app.services.outreach_ai import generate_outreach
from app.services.outreach_send_service import OutreachSendService
from app.services.customer_service import CustomerService
from app.models.user import User
from sqlalchemy import select

router = APIRouter()


# ── discovery (prompt -> leads) ───────────────────────────────────────────
@router.post("/discover", response_model=LeadDiscoverResponse)
async def discover_leads(
    body: LeadDiscoverRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Describe the leads you want; Tolkyn searches the web and saves the matches."""
    area_labels: list[str] = []
    if body.target_area_ids:
        areas = await GeoService(db, user_id).list_areas()
        chosen = {a.id: a for a in areas if a.id in body.target_area_ids}
        area_labels = [chosen[i].label for i in body.target_area_ids if i in chosen]

    result = await LeadDiscovery(db, user_id).run(
        body.prompt,
        offer=body.offer,
        from_company=body.from_company,
        from_website=body.from_website,
        max_results=body.max_results,
        area_labels=area_labels,
    )
    return LeadDiscoverResponse(
        success=result["success"],
        prompt=result["prompt"],
        target_profile=result["target_profile"],
        message=result["message"],
        stats=LeadDiscoverStats(**result["stats"]),
        leads=result["leads"],
    )


# ── generation ────────────────────────────────────────────────────────────
@router.post("/generate", response_model=LeadGenerateResponse)
async def generate_leads(
    body: LeadGenerateRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Crawl a website, extract contacts, score/enrich them, and save."""
    pipeline = LeadPipeline(db, user_id)
    result = await pipeline.run(
        body.url,
        max_pages=body.max_pages,
        max_depth=body.max_depth,
        enrich=body.enrich,
        icp_keywords=body.icp_keywords,
        save=body.save,
    )
    return LeadGenerateResponse(
        success=result["success"],
        url=result["url"],
        message=result["message"],
        stats=LeadGenerateStats(**result["stats"]),
        leads=result["leads"],
    )


# ── collection ────────────────────────────────────────────────────────────
@router.get("", response_model=LeadListResponse)
async def list_leads(
    status: Optional[str] = None,
    score: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = Query(None, min_length=1),
    converted: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db, user_id)
    items, total = await service.list_leads(
        status_filter=status,
        score=score,
        source=source,
        search=search,
        converted=converted,
        limit=limit,
        offset=offset,
    )
    return LeadListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    data: LeadCreate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await LeadService(db, user_id).create_lead(data)


@router.get("/summary", response_model=LeadSummaryResponse)
async def lead_summary(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await LeadService(db, user_id).summary()


@router.get("/status-counts", response_model=list[LeadStatusCount])
async def lead_status_counts(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await LeadService(db, user_id).status_counts()


@router.get("/source-counts", response_model=list[LeadSourceCount])
async def lead_source_counts(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await LeadService(db, user_id).source_counts()


@router.post("/bulk", response_model=dict)
async def bulk_lead_action(
    data: LeadBulkAction,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await LeadService(db, user_id).bulk_action(data)


@router.post("/send-bulk", response_model=BulkSendResult)
async def send_outreach_bulk(
    body: BulkSendRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Send the drafted outreach to every selected lead, via one sending account."""
    return await OutreachSendService(db, user_id).send_bulk(
        body.lead_ids, body.email_account_id, body.include_proposal
    )


# ── item ──────────────────────────────────────────────────────────────────
@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await LeadService(db, user_id).get_lead(lead_id)


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    data: LeadUpdate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await LeadService(db, user_id).update_lead(lead_id, data)


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await LeadService(db, user_id).delete_lead(lead_id)


@router.get("/{lead_id}/outreach", response_model=LeadOutreach)
async def get_lead_outreach(
    lead_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    lead = await LeadService(db, user_id).get_owned_model(lead_id)
    if not lead.outreach_email:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No outreach generated yet")
    return LeadOutreach(
        lead_id=lead.id,
        subject=lead.outreach_subject or "",
        email_body=lead.outreach_email,
        proposal=lead.outreach_proposal or "",
        generated_by="stored",
        generated_at=lead.outreach_generated_at,
    )


@router.post("/{lead_id}/outreach", response_model=LeadOutreach)
async def create_lead_outreach(
    lead_id: str,
    body: LeadOutreachRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate (or regenerate) a tailored cold email + proposal for this lead."""
    service = LeadService(db, user_id)
    lead = await service.get_owned_model(lead_id)

    if lead.outreach_email and not body.regenerate:
        return LeadOutreach(
            lead_id=lead.id,
            subject=lead.outreach_subject or "",
            email_body=lead.outreach_email,
            proposal=lead.outreach_proposal or "",
            generated_by="stored",
            generated_at=lead.outreach_generated_at,
        )

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    cf = lead.custom_fields or {}

    offer = body.offer if body.offer is not None else cf.get("offer", "")
    from_company = (
        body.from_company
        if body.from_company is not None
        else cf.get("from_company") or (user.position if user else "") or (user.name if user else "")
    )
    from_website = body.from_website if body.from_website is not None else cf.get("from_website", "")

    # persist any newly supplied sender details so re-generation is consistent
    if body.offer is not None or body.from_company is not None or body.from_website is not None:
        cf = {**cf, "offer": offer, "from_company": from_company, "from_website": from_website}
        lead.custom_fields = cf

    result = await generate_outreach(
        {
            "company": lead.company or lead.name,
            "website": lead.website_url,
            "ai_summary": lead.ai_summary,
            "key_facts": cf.get("key_facts", []),
            "position": lead.position,
            "email": lead.email,
        },
        offer=offer or "",
        sender_name=(user.name if user else "") or "",
        sender_company=from_company or "",
        sender_website=from_website or "",
        tone=body.tone,
    )

    saved = await service.save_outreach(
        lead_id, result["subject"], result["email_body"], result["proposal"]
    )
    return LeadOutreach(
        lead_id=saved.id,
        subject=saved.outreach_subject or "",
        email_body=saved.outreach_email or "",
        proposal=saved.outreach_proposal or "",
        generated_by=result["generated_by"],
        generated_at=saved.outreach_generated_at,
    )


@router.post("/{lead_id}/send", response_model=SendResult)
async def send_lead_outreach(
    lead_id: str,
    body: SendOutreachRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Send the drafted email (+ proposal) to this lead from a chosen sending account."""
    return await OutreachSendService(db, user_id).send_one(
        lead_id, body.email_account_id, body.include_proposal
    )


@router.post("/{lead_id}/convert", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def convert_lead_to_customer(
    lead_id: str,
    body: ConvertLeadRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Push a lead into the CRM as a customer and mark it converted."""
    leads = LeadService(db, user_id)
    lead = await leads.get_owned_model(lead_id)
    customer = await CustomerService(db, user_id).create_from_lead(lead, body)
    await leads.mark_converted(lead_id, customer.id)
    return customer
