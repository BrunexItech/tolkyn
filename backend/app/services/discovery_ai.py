"""OpenAI-backed lead discovery: turn a prompt into search targets, then
summarise each scanned company against the user's intent."""
import asyncio
from typing import Any, Dict, List

from app.services.ai_client import ai

_PLAN_SYSTEM = (
    "You are a B2B prospecting research assistant. Given a natural-language description of "
    "the leads a user wants, produce a concrete search plan. Return ONLY JSON."
)


async def plan_search(prompt: str) -> Dict[str, Any]:
    """
    -> {
         "target_profile": str,
         "search_queries": [str, ...],      # web-search queries
         "candidates": [{"name": str, "domain": str, "rationale": str}, ...]
       }
    """
    client = ai()
    if not client.available:
        return {"target_profile": prompt, "search_queries": [prompt], "candidates": []}

    user = (
        f'User wants: "{prompt}"\n\n'
        "Return JSON with:\n"
        '- "target_profile": one sentence describing the ideal company.\n'
        '- "search_queries": 4-6 varied web search queries that would surface these companies '
        "(include location / niche modifiers, avoid directory sites).\n"
        '- "candidates": 6-12 real companies that plausibly match, each '
        '{"name","domain" (best guess, bare domain, no scheme),"rationale" (short)}.\n'
        "Only include companies you have real knowledge of. Prefer smaller / mid-market firms."
    )
    try:
        data = await client.json(_PLAN_SYSTEM, user, temperature=0.4, max_tokens=1100)
    except Exception as exc:  # noqa: BLE001
        print(f"[discovery_ai] plan failed: {exc}")
        return {"target_profile": prompt, "search_queries": [prompt], "candidates": []}

    data.setdefault("target_profile", prompt)
    data.setdefault("search_queries", [prompt])
    data.setdefault("candidates", [])
    data["search_queries"] = [q for q in data["search_queries"] if isinstance(q, str)][:6]
    data["candidates"] = [
        c for c in data["candidates"] if isinstance(c, dict) and c.get("domain")
    ][:12]
    return data


_SUM_SYSTEM = (
    "You qualify B2B leads. Given a company's public site data and the user's target, return "
    "ONLY JSON assessing fit for outreach."
)


async def summarize_lead(company: Dict[str, Any], prompt: str, target_profile: str) -> Dict[str, Any]:
    client = ai()
    fallback = {
        "summary": (company.get("description") or f"{company.get('company')} — see website.")[:280],
        "fit_score": 55 if (company.get("email") or company.get("phone")) else 35,
        "fit_rating": "warm",
        "key_facts": [],
        "recommendation": "Review the site and personalise an opener.",
        "best_contact": company.get("email") or company.get("phone") or "",
        "intent_signals": [],
    }
    if not client.available:
        return fallback

    payload = {
        "company": company.get("company"),
        "domain": company.get("domain"),
        "title": company.get("title"),
        "description": (company.get("description") or "")[:700],
        "headers": (company.get("headers") or [])[:8],
        "keywords": (company.get("keywords") or [])[:12],
        "emails": (company.get("emails") or [])[:3],
        "phones": (company.get("phones") or [])[:2],
        "socials": company.get("social_links") or {},
    }
    user = (
        f'User is looking for: "{prompt}"\nIdeal company: {target_profile}\n\n'
        f"Company data: {payload}\n\n"
        "Return JSON: "
        '"summary" (<=45 words, what they do + why they might fit), '
        '"fit_score" (0-100 int), "fit_rating" ("hot"|"warm"|"cold"), '
        '"key_facts" (3-5 short bullet strings: size, sector, location, notable), '
        '"recommendation" (<=20 words), '
        '"best_contact" (the best email or phone from the data, or ""), '
        '"intent_signals" (2-4 short strings).'
    )
    try:
        data = await client.json(_SUM_SYSTEM, user, temperature=0.3, max_tokens=500)
    except Exception as exc:  # noqa: BLE001
        print(f"[discovery_ai] summarize failed: {exc}")
        return fallback
    for k, v in fallback.items():
        data.setdefault(k, v)
    return data


async def summarize_many(
    companies: List[Dict[str, Any]], prompt: str, target_profile: str, *, concurrency: int = 5
) -> List[Dict[str, Any]]:
    sem = asyncio.Semaphore(concurrency)

    async def one(c: Dict[str, Any]) -> Dict[str, Any]:
        async with sem:
            c["_ai"] = await summarize_lead(c, prompt, target_profile)
            return c

    return await asyncio.gather(*(one(c) for c in companies))
