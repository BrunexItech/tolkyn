"""
AI-generated marketing email + business proposal for a discovered lead.

The person using Tolkyn is a business owner / seller. They found this lead and
now want to pitch THEIR OWN business to it. So the AI writes as the seller,
addressed to the prospect company, using everything known about that prospect.
"""
from typing import Any, Dict

from app.services.ai_client import ai

_SYSTEM = (
    "You are an expert B2B sales copywriter. You write on behalf of a business owner who "
    "is reaching out to a prospective client company to win their business. Reference the "
    "prospect's actual business. Be concise, specific and human. No fluff, no lorem ipsum, "
    "no invented statistics or fake testimonials. Return ONLY JSON."
)


async def generate_outreach(
    lead: Dict[str, Any],
    *,
    offer: str = "",
    sender_name: str = "",
    sender_company: str = "",
    sender_website: str = "",
    tone: str = "warm, confident and specific",
) -> Dict[str, Any]:
    client = ai()
    prospect = lead.get("company") or "the company"
    seller = sender_company or sender_name or "our company"

    prospect_ctx = {
        "prospect_company": prospect,
        "prospect_website": lead.get("website_url") or lead.get("website"),
        "what_the_prospect_does": lead.get("ai_summary") or lead.get("description") or "",
        "prospect_key_facts": lead.get("key_facts") or [],
        "prospect_contact_role": lead.get("position") or "",
    }
    seller_ctx = {
        "your_business": seller,
        "your_name": sender_name,
        "your_website": sender_website,
        "what_you_offer": offer or "(not specified — infer a plausible, relevant service)",
    }

    if not client.available:
        return {
            "subject": f"{seller} — an idea for {prospect}",
            "email_body": (
                f"Hi {prospect} team,\n\nI run {seller}. "
                f"{offer or 'We help businesses like yours grow.'} "
                f"I think there's a strong fit with what you're doing.\n\n"
                "Open to a quick call this week?\n\n"
                f"Best,\n{sender_name or seller}"
            ),
            "proposal": f"# Proposal from {seller} for {prospect}\n\n(Add an OpenAI key for a tailored proposal.)",
            "generated_by": "template",
        }

    user = (
        f"YOU (the seller): {seller_ctx}\n"
        f"THE PROSPECT you are pitching: {prospect_ctx}\n"
        f"Tone: {tone}.\n\n"
        "Write outreach from the seller to the prospect. Return JSON:\n"
        '- "subject": specific subject line naming a benefit or observation (<=9 words).\n'
        '- "email_body": a 90-140 word marketing email. Line 1 = a specific, genuine '
        "observation about the prospect's business. Line 2-3 = what you offer and why it "
        "fits THEM specifically. End with one low-friction call to action. Plain text, real "
        "line breaks, signed off with the sender's name and business.\n"
        '- "proposal": a one-page business proposal in Markdown FROM the seller TO the '
        "prospect, with sections: ## Overview (the prospect's situation + your read on it), "
        "## What we propose, ## How it works, ## Why us, ## Investment, ## Next steps. "
        "Concrete and tailored to this prospect. Use bracket placeholders like [price] or "
        "[timeline] only where a real value is genuinely unknown."
    )
    try:
        data = await client.json(
            _SYSTEM, user, model="gpt-4o-mini", temperature=0.7, max_tokens=1600, timeout=75
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[outreach_ai] failed: {exc}")
        raise

    return {
        "subject": (data.get("subject") or f"{seller} — an idea for {prospect}").strip(),
        "email_body": (data.get("email_body") or "").strip(),
        "proposal": (data.get("proposal") or "").strip(),
        "generated_by": "gpt-4o-mini",
    }
