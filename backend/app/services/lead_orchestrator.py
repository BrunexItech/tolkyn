import asyncio
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead, LeadStatus, LeadScore, LeadSource
from app.services.groq_service import GroqService
from app.services.scraper_service import ScraperService
from app.schemas.lead import LeadCreate, LeadResponse


class LeadOrchestrator:
    """Orchestrates the lead generation workflow."""
    
    def __init__(self, db: AsyncSession, user_id: str, workspace_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = workspace_id
        self.groq_service = GroqService()
        self.scraper_service = ScraperService()
    
    async def generate_leads(
        self,
        keywords: str,
        ai_context: str,
        platforms: List[str],
        location: Optional[str] = None,
        industry: Optional[str] = None,
        max_results: int = 50
    ) -> Dict[str, Any]:
        """
        Full lead generation workflow:
        1. Generate search queries using Groq AI
        2. Scrape leads from platforms
        3. Enrich each lead with AI
        4. Save leads to database
        """
        
        start_time = datetime.now()
        
        # Step 1: Generate search queries
        print("Step 1: Generating search queries...")
        search_queries = await self.groq_service.generate_search_queries(keywords, ai_context)
        
        # Step 2: Scrape leads from platforms
        print("Step 2: Scraping leads from platforms...")
        raw_leads = await self.scraper_service.search_all_platforms(
            keywords=keywords,
            ai_context=ai_context,
            platforms=platforms,
            location=location,
            industry=industry,
            max_results=max_results
        )
        
        # Step 3: Enrich and score each lead
        print("Step 3: Enriching and scoring leads...")
        enriched_leads = []
        processed_leads = []
        
        for raw_lead in raw_leads:
            try:
                # Score the lead
                scored = await self.groq_service.generate_lead_score(raw_lead)
                
                # Enrich the lead
                enriched = await self.groq_service.enrich_lead_data(raw_lead)
                
                # Combine data
                final_lead = {
                    **raw_lead,
                    "score": scored.get("score", 50),
                    "rating": scored.get("rating", "WARM"),
                    "ai_summary": scored.get("summary", ""),
                    "ai_recommendation": scored.get("recommendation", ""),
                    "ai_intent_signals": scored.get("intent_signals", []),
                    "ai_confidence_score": scored.get("score", 50),
                    "enriched_summary": enriched.get("summary", ""),
                    "seniority": enriched.get("seniority", "unknown"),
                    "topics_of_interest": enriched.get("topics_of_interest", []),
                    "outreach_angle": enriched.get("outreach_angle", ""),
                }
                
                enriched_leads.append(final_lead)
            except Exception as e:
                print(f"Error enriching lead: {e}")
                processed_leads.append(raw_lead)
        
        # Step 4: Save leads to database
        print("Step 4: Saving leads to database...")
        saved_leads = []
        
        for lead_data in enriched_leads:
            try:
                # Map AI rating to LeadScore enum
                rating = lead_data.get("rating", "WARM").upper()
                score_map = {
                    "HOT": LeadScore.HOT,
                    "WARM": LeadScore.WARM,
                    "COLD": LeadScore.COLD,
                    "UNKNOWN": LeadScore.UNKNOWN
                }
                lead_score = score_map.get(rating, LeadScore.UNKNOWN)
                
                # Create lead
                create_data = LeadCreate(
                    name=lead_data.get("name", "Unknown"),
                    email=lead_data.get("email"),
                    phone=lead_data.get("phone"),
                    company=lead_data.get("company"),
                    position=lead_data.get("position"),
                    industry=lead_data.get("industry", lead_data.get("industry")),
                    location=lead_data.get("location"),
                    linkedin_url=lead_data.get("linkedin_url"),
                    instagram_handle=lead_data.get("instagram_handle"),
                    twitter_handle=lead_data.get("twitter_handle"),
                    source=LeadSource.SCRAPED,
                    status=LeadStatus.NEW,
                    notes=lead_data.get("notes", ""),
                    tags=["AI Generated", lead_data.get("source", "Scraped")]
                )
                
                # Create lead using service
                from app.services.lead_service import LeadService
                lead_service = LeadService(self.db, self.user_id)
                saved_lead = await lead_service.create_lead(create_data, self.workspace_id)
                
                # Add AI fields
                lead_obj = await lead_service._get_lead_by_id(saved_lead.id)
                if lead_obj:
                    lead_obj.ai_confidence_score = lead_data.get("ai_confidence_score", 50)
                    lead_obj.ai_summary = lead_data.get("ai_summary", "")
                    lead_obj.ai_recommendation = lead_data.get("ai_recommendation", "")
                    lead_obj.ai_intent_signals = lead_data.get("ai_intent_signals", [])
                    lead_obj.ai_processed_at = datetime.now()
                    lead_obj.score = lead_score
                    lead_obj.scraped_from = lead_data.get("source", "Scraped")
                    lead_obj.scraped_at = datetime.now()
                    
                    await self.db.commit()
                    await self.db.refresh(lead_obj)
                    
                    saved_leads.append(lead_obj)
                
            except Exception as e:
                print(f"Error saving lead: {e}")
                continue
        
        # Calculate processing time
        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()
        
        return {
            "query_id": str(uuid.uuid4()),
            "total_found": len(raw_leads),
            "processed_count": len(enriched_leads),
            "saved_count": len(saved_leads),
            "leads": [await self._to_response(lead) for lead in saved_leads],
            "search_metadata": {
                "keywords": keywords,
                "ai_context": ai_context,
                "platforms": platforms,
                "location": location,
                "industry": industry,
                "processing_time": f"{processing_time:.2f}s"
            }
        }
    
    async def enrich_existing_lead(self, lead_id: str) -> Dict[str, Any]:
        """Enrich an existing lead with AI."""
        
        from app.services.lead_service import LeadService
        lead_service = LeadService(self.db, self.user_id)
        lead = await lead_service._get_lead_by_id(lead_id)
        
        if not lead:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lead not found"
            )
        
        # Prepare lead data for AI
        lead_data = {
            "name": lead.name,
            "company": lead.company,
            "position": lead.position,
            "industry": lead.industry,
            "location": lead.location,
            "source": lead.source.value,
            "notes": lead.notes,
        }
        
        # Score the lead
        scored = await self.groq_service.generate_lead_score(lead_data)
        
        # Enrich the lead
        enriched = await self.groq_service.enrich_lead_data(lead_data)
        
        # Update lead
        rating = scored.get("rating", "WARM").upper()
        score_map = {
            "HOT": LeadScore.HOT,
            "WARM": LeadScore.WARM,
            "COLD": LeadScore.COLD,
            "UNKNOWN": LeadScore.UNKNOWN
        }
        
        lead.ai_confidence_score = scored.get("score", 50)
        lead.ai_summary = scored.get("summary", "")
        lead.ai_recommendation = scored.get("recommendation", "")
        lead.ai_intent_signals = scored.get("intent_signals", [])
        lead.ai_processed_at = datetime.now()
        lead.score = score_map.get(rating, LeadScore.UNKNOWN)
        
        await self.db.commit()
        await self.db.refresh(lead)
        
        return {
            "lead_id": lead.id,
            "score": scored.get("score", 50),
            "rating": rating,
            "summary": scored.get("summary", ""),
            "recommendation": scored.get("recommendation", ""),
            "intent_signals": scored.get("intent_signals", []),
            "enriched_data": enriched
        }
    
    async def _to_response(self, lead) -> Dict[str, Any]:
        """Convert lead to response dict."""
        return {
            "id": lead.id,
            "name": lead.name,
            "email": lead.email,
            "phone": lead.phone,
            "company": lead.company,
            "position": lead.position,
            "industry": lead.industry,
            "location": lead.location,
            "source": lead.source.value if lead.source else None,
            "status": lead.status.value if lead.status else None,
            "score": lead.score.value if lead.score else None,
            "ai_confidence_score": lead.ai_confidence_score,
            "ai_summary": lead.ai_summary,
            "ai_recommendation": lead.ai_recommendation,
            "ai_intent_signals": lead.ai_intent_signals,
            "tags": lead.tags,
            "notes": lead.notes,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
            "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
        }