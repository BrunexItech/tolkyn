"""
Prompt -> leads.

1. Ask OpenAI for a search plan (target profile, queries, candidate companies).
2. Resolve candidate domains + keyless web-search results into site roots.
3. Shallow-scan each site for real contact data.
4. Summarise / score each company against the user's intent.
5. Persist the best matches to the caller's workspace.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import LeadSource, LeadStatus
from app.schemas.lead import LeadCreate
from app.services.discovery_ai import plan_search, summarize_many
from app.services.lead_service import LeadService
from app.services.site_scanner import scan_many
from app.services.web_search import search_domains

_RATING_TO_SCORE = {"hot": "hot", "warm": "warm", "cold": "cold"}


class LeadDiscovery:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.leads = LeadService(db, user_id)
        self._offer = ""
        self._from_company = ""
        self._from_website = ""

    async def run(
        self,
        prompt: str,
        *,
        offer: str = "",
        from_company: str = "",
        from_website: str = "",
        max_results: int = 12,
        max_scan: int = 18,
        area_labels: List[str] | None = None,
    ) -> Dict[str, Any]:
        self._offer = offer
        self._from_company = from_company
        self._from_website = from_website
        started = datetime.now(timezone.utc)

        # Geo Targeting integration: scope the AI's search-query planning to
        # the caller's saved areas rather than searching anywhere. The plan's
        # own prompt already asks for "location / niche modifiers" in the
        # generated queries, so naming the areas explicitly here is what
        # actually makes that happen.
        planning_prompt = prompt
        if area_labels:
            planning_prompt = f"{prompt}\n\nOnly look for companies located in: {', '.join(area_labels)}."

        plan = await plan_search(planning_prompt)
        target_profile = plan.get("target_profile", prompt)

        # candidate site roots
        roots: List[str] = []
        seen_hosts: set[str] = set()

        def add(url: str) -> None:
            if not url:
                return
            if not url.startswith(("http://", "https://")):
                url = "https://" + url.strip().strip("/")
            host = urlparse(url).netloc.lower().replace("www.", "")
            if host and host not in seen_hosts:
                seen_hosts.add(host)
                roots.append(f"https://{host}")

        for c in plan.get("candidates", []):
            add(str(c.get("domain", "")))

        try:
            for r in await search_domains(plan.get("search_queries", [])):
                add(r)
        except Exception as exc:  # noqa: BLE001
            print(f"[LeadDiscovery] web search skipped: {exc}")

        roots = roots[:max_scan]

        scanned = await scan_many(roots)
        unique = self._dedupe(scanned)

        summarized = await summarize_many(unique, prompt, target_profile)
        summarized.sort(key=lambda c: c.get("_ai", {}).get("fit_score", 0), reverse=True)
        selected = summarized[:max_results]

        saved = []
        skipped = 0
        for company in selected:
            created = await self.leads.create_lead_with_ai(
                self._to_create(company),
                self._ai_payload(company, prompt),
            )
            if created is None:
                skipped += 1
            else:
                saved.append(created)

        duration = (datetime.now(timezone.utc) - started).total_seconds()
        return {
            "success": True,
            "prompt": prompt,
            "target_profile": target_profile,
            "message": (
                f"Searched the web, scanned {len(roots)} sites, "
                f"qualified {len(unique)} companies, saved {len(saved)}."
                if saved
                else "No matching companies with reachable contact details were found. Try rephrasing the prompt."
            ),
            "stats": {
                "sites_scanned": len(roots),
                "companies_found": len(unique),
                "qualified": len(selected),
                "saved": len(saved),
                "skipped_duplicates": skipped,
                "duration_seconds": round(duration, 2),
            },
            "leads": saved,
        }

    # ---------------------------------------------------------------- helpers
    def _dedupe(self, scanned: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen_domains: set[str] = set()
        seen_emails: set[str] = set()
        out: List[Dict[str, Any]] = []
        for c in scanned:
            dom = (c.get("domain") or "").lower().replace("www.", "")
            email = (c.get("email") or "").lower()
            if dom and dom in seen_domains:
                continue
            if email and email in seen_emails:
                continue
            if dom:
                seen_domains.add(dom)
            if email:
                seen_emails.add(email)
            out.append(c)
        return out

    def _to_create(self, c: Dict[str, Any]) -> LeadCreate:
        socials = c.get("social_links") or {}
        return LeadCreate(
            name=str(c.get("company") or c.get("domain") or "Unknown")[:255],
            email=c.get("email"),
            phone=c.get("phone"),
            company=(c.get("company") or "")[:255] or None,
            position=None,
            website_url=c.get("website"),
            linkedin_url=socials.get("linkedin"),
            instagram_handle=socials.get("instagram"),
            facebook_url=socials.get("facebook"),
            twitter_handle=socials.get("twitter"),
            source=LeadSource.SCRAPED,
            status=LeadStatus.NEW,
            tags=["discovered", c.get("domain") or "web"],
            notes=f"Discovered via prompt search · {c.get('domain', '')}",
        )

    def _ai_payload(self, c: Dict[str, Any], prompt: str) -> Dict[str, Any]:
        ai = c.get("_ai", {})
        rating = str(ai.get("fit_rating", "warm")).lower()
        return {
            "score": int(ai.get("fit_score", 55)),
            "rating": _RATING_TO_SCORE.get(rating, "warm"),
            "summary": ai.get("summary", ""),
            "recommendation": ai.get("recommendation", ""),
            "intent_signals": ai.get("intent_signals", []),
            "outreach_angle": ai.get("recommendation", ""),
            "seniority": "unknown",
            "enriched_by": "openai-discovery",
            "key_facts": ai.get("key_facts", []),
            "discovery_prompt": prompt,
            "offer": self._offer,
            "from_company": self._from_company,
            "from_website": self._from_website,
        }
