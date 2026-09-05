"""
Lead scoring + enrichment.

Always produces a result from a fast local heuristic. If a GROQ_API_KEY is
configured, the heuristic is refined with an LLM pass (run in a worker thread so
it never blocks the event loop). Any AI failure falls back to the heuristic.
"""
import asyncio
import json
from typing import Any, Dict, List

from app.core.config import settings

try:  # optional dependency / key
    from groq import Groq
except Exception:  # pragma: no cover
    Groq = None

ROLE_PREFIXES = ("info", "contact", "hello", "support", "sales", "admin", "office", "team")


class LeadEnricher:
    def __init__(self) -> None:
        self._client = None
        if Groq is not None and settings.GROQ_API_KEY:
            try:
                self._client = Groq(api_key=settings.GROQ_API_KEY)
            except Exception:
                self._client = None
        self._model = "llama-3.1-8b-instant"

    # ------------------------------------------------------------------ public
    async def score(self, lead: Dict[str, Any], icp_keywords: List[str] | None = None) -> Dict[str, Any]:
        base = self._heuristic(lead, icp_keywords or [])
        if not self._client:
            return base
        try:
            ai = await asyncio.wait_for(
                asyncio.to_thread(self._ai_score, lead, icp_keywords or []),
                timeout=20,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[LeadEnricher] AI pass failed, using heuristic: {exc}")
            return base

        # merge: keep heuristic score as a floor for confidence, prefer AI narrative
        merged = dict(base)
        if isinstance(ai.get("score"), (int, float)):
            merged["score"] = int(round((ai["score"] + base["score"]) / 2))
        for key in ("rating", "summary", "recommendation"):
            if ai.get(key):
                merged[key] = ai[key]
        if ai.get("intent_signals"):
            merged["intent_signals"] = ai["intent_signals"][:6]
        if ai.get("outreach_angle"):
            merged["outreach_angle"] = ai["outreach_angle"]
        if ai.get("seniority"):
            merged["seniority"] = ai["seniority"]
        merged["enriched_by"] = "groq+heuristic"
        return merged

    # --------------------------------------------------------------- heuristic
    def _heuristic(self, lead: Dict[str, Any], icp: List[str]) -> Dict[str, Any]:
        emails = [e for e in (lead.get("emails") or []) if e]
        phones = [p for p in (lead.get("phones") or []) if p]
        socials = lead.get("social_links") or {}
        text = " ".join(
            str(x).lower()
            for x in (
                lead.get("title", ""),
                lead.get("description", ""),
                " ".join(lead.get("keywords") or []),
                " ".join(lead.get("headers") or []),
            )
        )

        score = 18
        signals: List[str] = []

        if emails:
            local = emails[0].split("@")[0].lower()
            if any(local.startswith(p) for p in ROLE_PREFIXES):
                score += 16
                signals.append("role-based email published")
            else:
                score += 26
                signals.append("direct contact email found")
        if phones:
            score += 12
            signals.append("phone number listed")
        if socials.get("linkedin"):
            score += 12
            signals.append("active on LinkedIn")
        other_socials = [k for k in socials if k != "linkedin"]
        if other_socials:
            score += min(10, 4 * len(other_socials))
            signals.append(f"present on {', '.join(other_socials)}")

        icp_hits = [kw for kw in icp if kw.lower().strip() and kw.lower().strip() in text]
        if icp_hits:
            score += min(22, 8 + 4 * len(icp_hits))
            signals.append(f"matches target profile: {', '.join(icp_hits[:3])}")

        if len(lead.get("description") or "") > 80:
            score += 6
        if lead.get("company"):
            score += 4

        score = max(1, min(100, score))
        rating = "HOT" if score >= 70 else "WARM" if score >= 45 else "COLD"
        if not signals:
            signals = ["limited public contact data"]

        company = lead.get("company") or lead.get("domain") or "This company"
        summary = (
            f"{company} — {rating.title()} lead. "
            + ("Reachable contact details on site. " if emails or phones else "Contact details are thin. ")
            + (f"Signals: {signals[0]}." if signals else "")
        )
        recommendation = {
            "HOT": "Reach out within 24h with a tailored, value-first message.",
            "WARM": "Add to a nurture sequence and personalise the first touch.",
            "COLD": "Enrich further before outreach or deprioritise.",
        }[rating]

        return {
            "score": score,
            "rating": rating,
            "summary": summary.strip(),
            "recommendation": recommendation,
            "intent_signals": signals[:6],
            "outreach_angle": recommendation,
            "seniority": "unknown",
            "enriched_by": "heuristic",
        }

    # ---------------------------------------------------------------------- ai
    def _ai_score(self, lead: Dict[str, Any], icp: List[str]) -> Dict[str, Any]:
        payload = {
            "company": lead.get("company"),
            "website": lead.get("website") or lead.get("source_url"),
            "title": lead.get("title"),
            "description": (lead.get("description") or "")[:600],
            "emails": (lead.get("emails") or [])[:3],
            "phones": (lead.get("phones") or [])[:2],
            "socials": lead.get("social_links") or {},
            "keywords": (lead.get("keywords") or [])[:12],
        }
        prompt = (
            "You are a B2B lead qualification assistant. Score this lead for outreach.\n"
            f"Ideal customer profile keywords: {', '.join(icp) or 'none provided'}\n\n"
            f"Lead data: {json.dumps(payload)}\n\n"
            "Return ONLY valid minified JSON with keys: "
            'score (0-100 int), rating ("HOT"|"WARM"|"COLD"), summary (<=45 words), '
            "recommendation (<=25 words), intent_signals (array of 3-5 short strings), "
            'outreach_angle (<=20 words), seniority ("entry"|"mid"|"senior"|"executive"|"unknown").'
        )
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": "Return only valid JSON. No prose."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=380,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
