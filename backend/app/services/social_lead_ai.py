"""Classify a single social comment / DM: is this person a potential lead for a
product or service, how ready are they to buy, and what do they want?"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.services.ai_client import ai

_SYSTEM = (
    "You are a sales-development assistant for a business that runs social media accounts. "
    "You read ONE comment or direct message left on the business's post or page and decide "
    "whether the author is a potential sales lead for a product or service. "
    "Be realistic: most comments are not leads. Only mark is_lead true when the person shows "
    "genuine interest in buying, using, or learning more about a specific product/service. "
    "Generic praise, emojis, spam, tagging a friend, or complaints are NOT leads. "
    "Return ONLY JSON."
)

_INTENTS = {"hot", "warm", "cold", "none"}
_SENTIMENTS = {"positive", "neutral", "negative"}

# Heuristic fallback signals (used when OpenAI is unavailable / out of credits)
_HOT = [
    r"\bhow (much|do i (buy|order|get)|can i (buy|order|purchase))\b",
    r"\bprice\b", r"\bpricing\b", r"\bcost[s]?\b", r"\bquote\b", r"\bquotation\b",
    r"\bbuy\b", r"\border\b", r"\bpurchase\b", r"\bpayment\b", r"\bcheckout\b",
    r"\bin stock\b", r"\bavailable\b", r"\bdelivery\b", r"\bship (to|it)\b",
    r"\bdm(ed)? (me|you)\b", r"\bsend (me )?(the )?(link|details|catalog)\b",
    r"\bwhere (can|do) i (get|buy)\b", r"\bsign up\b", r"\bbook (a|the)\b",
]
_WARM = [
    r"\binterested\b", r"\bi want\b", r"\bi need\b", r"\blooking for\b",
    r"\bmore (info|information|details)\b", r"\bdoes it\b", r"\bcan it\b",
    r"\bhow does\b", r"\bwhat (is|are) the\b", r"\bany (chance|way)\b",
    r"\bis this (for|available)\b", r"\btell me more\b", r"\bwhen will\b",
    r"\bwhich (one|size|model)\b", r"\bfeatures?\b",
]

_NEG = ["scam", "fake", "terrible", "worst", "refund", "disappointed", "rip off",
        "ripoff", "fraud", "never again", "poor", "awful", "waste"]
_POS = ["love", "amazing", "great", "beautiful", "awesome", "perfect", "excellent",
        "obsessed", "need this", "want this", "gorgeous", "fire", "incredible"]


def _norm_list(v: Any, limit: int = 6) -> List[str]:
    if not isinstance(v, list):
        return []
    out = [str(x).strip() for x in v if str(x).strip()]
    return out[:limit]


def _heuristic(message: str, post_context: str = "") -> Dict[str, Any]:
    text = (message or "").lower().strip()
    if not text:
        return {
            "is_lead": False, "product_interest": None, "intent": "none",
            "buying_signals": [], "sentiment": "neutral", "confidence": 20,
            "summary": "Empty message.", "suggested_reply": "",
        }

    hot = [p for p in _HOT if re.search(p, text)]
    warm = [p for p in _WARM if re.search(p, text)]
    has_question = "?" in message

    if hot:
        intent, is_lead, conf = "hot", True, 78
    elif warm or (has_question and len(text) > 12):
        intent, is_lead, conf = "warm", True, 62
    elif any(w in text for w in _POS) and len(text) > 8:
        intent, is_lead, conf = "cold", False, 40
    else:
        intent, is_lead, conf = "none", False, 30

    sentiment = "neutral"
    if any(w in text for w in _NEG):
        sentiment = "negative"
        intent, is_lead = "none", False
    elif any(w in text for w in _POS):
        sentiment = "positive"

    signals: List[str] = []
    if hot:
        signals.append("Asked about price / how to buy")
    if has_question:
        signals.append("Asked a direct question")
    if "dm" in text:
        signals.append("Wants to move to DMs")

    interest: Optional[str] = None
    ctx = (post_context or "").strip()
    _generic_ctx = {
        "dm", "direct message", "instagram direct message", "on your post",
        "a comment", "comment", "mention", "review",
    }
    if is_lead and ctx and ctx.lower() not in _generic_ctx and len(ctx) > 4:
        interest = ctx[:120]

    return {
        "is_lead": is_lead,
        "product_interest": interest,
        "intent": intent,
        "buying_signals": signals,
        "sentiment": sentiment,
        "confidence": conf,
        "summary": (
            f"{'Potential lead' if is_lead else 'Not a clear lead'} — "
            f"{'buying-intent language' if hot else 'a question / interest' if warm or has_question else 'generic comment'}."
        ),
        "suggested_reply": (
            "Thanks for reaching out! I've sent you a DM with the details."
            if is_lead else ""
        ),
    }


def _clean(data: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
    intent = str(data.get("intent", "")).lower().strip()
    if intent not in _INTENTS:
        intent = fallback["intent"]
    sentiment = str(data.get("sentiment", "")).lower().strip()
    if sentiment not in _SENTIMENTS:
        sentiment = fallback["sentiment"]

    is_lead = bool(data.get("is_lead", fallback["is_lead"]))
    if intent == "none":
        is_lead = False
    if is_lead and intent == "none":
        intent = "warm"

    try:
        conf = int(round(float(data.get("confidence", fallback["confidence"]))))
    except (TypeError, ValueError):
        conf = fallback["confidence"]
    conf = max(0, min(100, conf))

    pi = data.get("product_interest") or None
    if isinstance(pi, str):
        pi = pi.strip()[:240] or None

    return {
        "is_lead": is_lead,
        "product_interest": pi,
        "intent": intent,
        "buying_signals": _norm_list(data.get("buying_signals")) or fallback["buying_signals"],
        "sentiment": sentiment,
        "confidence": conf,
        "summary": str(data.get("summary") or fallback["summary"]).strip()[:600],
        "suggested_reply": str(data.get("suggested_reply") or "").strip()[:600],
    }


async def classify_message(
    message: str,
    *,
    post_context: str = "",
    platform: str = "",
    author: str = "",
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    -> {
         is_lead: bool,
         product_interest: str | None,
         intent: "hot"|"warm"|"cold"|"none",
         buying_signals: [str],
         sentiment: "positive"|"neutral"|"negative",
         confidence: int (0-100),
         summary: str,
         suggested_reply: str,
         classifier: "openai" | "heuristic",
       }
    """
    fallback = _heuristic(message, post_context)
    client = ai()
    if not client.available:
        return {**fallback, "classifier": "heuristic"}

    convo = ""
    if history:
        lines = [f'{h.get("author", "?")}: {h.get("body", "")}'.strip() for h in history[-6:]]
        convo = "Earlier in the thread:\n" + "\n".join(lines) + "\n\n"

    user = (
        f"{convo}"
        f'Platform: {platform or "unknown"}\n'
        f'The post / page is about: "{(post_context or "unknown").strip()[:300]}"\n'
        f'{author or "Someone"} wrote: "{(message or "").strip()[:800]}"\n\n'
        "Return JSON with:\n"
        '- "is_lead" (bool): true only if they show real interest in a product/service.\n'
        '- "product_interest" (string|null): the specific product, service or offer they '
        "seem interested in, inferred from their words + the post. Null if not a lead.\n"
        '- "intent" ("hot"|"warm"|"cold"|"none"): hot = explicit buying signal (price, how to '
        'buy, order); warm = asking real questions / clear interest; cold = mild interest only; '
        'none = not a lead.\n'
        '- "buying_signals" (array of <=4 short strings): concrete cues you saw, e.g. '
        '"asked for price", "wants it shipped to Nairobi". Empty if none.\n'
        '- "sentiment" ("positive"|"neutral"|"negative").\n'
        '- "confidence" (0-100 int): how sure you are about is_lead.\n'
        '- "summary" (<=30 words): plain-language read on this person.\n'
        '- "suggested_reply" (<=45 words): a warm, human first reply that moves them forward. '
        "No emojis. Empty string if not a lead."
    )
    try:
        data = await client.json(_SYSTEM, user, temperature=0.2, max_tokens=420)
    except Exception as exc:  # noqa: BLE001
        print(f"[social_lead_ai] classify failed: {exc}")
        return {**fallback, "classifier": "heuristic"}

    return {**_clean(data, fallback), "classifier": "openai"}
