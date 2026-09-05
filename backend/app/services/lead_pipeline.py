"""
Website -> leads pipeline.

1. Crawl the given site (real crawl, same-domain, robots-aware).
2. Extract + de-duplicate contact records.
3. Score / enrich each one (heuristic, optionally refined by Groq).
4. Persist to the caller's workspace.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.crawler.base_crawler import BaseCrawler
from app.services.lead_enricher import LeadEnricher
from app.services.lead_service import LeadService
from app.schemas.lead import LeadCreate
from app.models.lead import LeadSource, LeadStatus


class LeadPipeline:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.enricher = LeadEnricher()
        self.leads = LeadService(db, user_id)

    async def run(
        self,
        url: str,
        *,
        max_pages: int = 25,
        max_depth: int = 2,
        enrich: bool = True,
        icp_keywords: Optional[List[str]] = None,
        save: bool = True,
    ) -> Dict[str, Any]:
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        started = datetime.now(timezone.utc)

        crawler = BaseCrawler(max_pages=max_pages, max_depth=max_depth, delay=0.4)
        raw = await crawler.crawl(url)
        stats = crawler.get_statistics()

        unique = self._dedupe(raw)

        enriched: List[Dict[str, Any]] = []
        for record in unique:
            if enrich:
                ai = await self.enricher.score(record, icp_keywords or [])
            else:
                ai = {
                    "score": 50, "rating": "unknown",
                    "summary": "", "recommendation": "", "intent_signals": [],
                    "outreach_angle": "", "seniority": "unknown", "enriched_by": "none",
                }
            record["_ai"] = ai
            enriched.append(record)

        saved: List = []
        skipped = 0
        if save:
            for record in enriched:
                created = await self.leads.create_lead_with_ai(
                    self._to_create(record), record["_ai"]
                )
                if created is None:
                    skipped += 1
                else:
                    saved.append(created)

        duration = (datetime.now(timezone.utc) - started).total_seconds()
        return {
            "success": True,
            "url": url,
            "message": (
                f"Crawled {stats['processed_count']} pages, "
                f"found {len(unique)} unique contacts, saved {len(saved)}."
                if unique
                else "No contact records found on this site."
            ),
            "stats": {
                "pages_crawled": stats["processed_count"],
                "candidates": len(raw),
                "unique": len(unique),
                "enriched": len(enriched),
                "saved": len(saved),
                "skipped_duplicates": skipped,
                "duration_seconds": round(duration, 2),
            },
            "leads": saved,
        }

    # ----------------------------------------------------------------- helpers
    def _dedupe(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen_emails: set[str] = set()
        seen_companies: set[str] = set()
        out: List[Dict[str, Any]] = []

        for lead in raw:
            emails = [e.lower() for e in (lead.get("emails") or []) if e]
            phones = lead.get("phones") or []
            company = (lead.get("company") or lead.get("company_name") or "").strip()

            if not emails and not phones:
                continue

            primary_email = emails[0] if emails else None
            if primary_email and primary_email in seen_emails:
                continue
            key_company = company.lower()
            if not primary_email and key_company and key_company in seen_companies:
                continue

            if primary_email:
                seen_emails.add(primary_email)
            if key_company:
                seen_companies.add(key_company)

            lead["email"] = primary_email
            lead["emails"] = emails
            lead["phone"] = phones[0] if phones else None
            lead["company"] = company or lead.get("domain") or "Unknown company"
            out.append(lead)

        return out

    def _to_create(self, r: Dict[str, Any]) -> LeadCreate:
        socials = r.get("social_links") or {}
        name = r.get("company") or r.get("domain") or "Unknown"
        return LeadCreate(
            name=str(name)[:255],
            email=r.get("email"),
            phone=r.get("phone"),
            company=(r.get("company") or "")[:255] or None,
            position=(r.get("title") or "")[:255] or None,
            industry=None,
            location=None,
            linkedin_url=socials.get("linkedin"),
            instagram_handle=socials.get("instagram"),
            facebook_url=socials.get("facebook"),
            twitter_handle=socials.get("twitter"),
            website_url=r.get("website") or r.get("source_url"),
            source=LeadSource.WEBSITE,
            status=LeadStatus.NEW,
            tags=["generated", self._host(r)],
            notes=f"Discovered while crawling {r.get('source_url', '')}",
        )

    @staticmethod
    def _host(r: Dict[str, Any]) -> str:
        try:
            return urlparse(r.get("source_url") or "").netloc or "web"
        except Exception:
            return "web"
