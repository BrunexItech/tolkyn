"""Conversational image generation via the OpenAI **Responses API**.

A mainline model (gpt-5+/gpt-6) is the orchestrator: it reads the user's
request, silently revises the prompt for the image model, decides whether to
generate a fresh image or edit one already in the conversation, and calls the
GPT Image 2.5 tool. This is the same pipeline ChatGPT uses — so we no longer
hand-write a planner/architect of our own.

Two things we still do ourselves, on purpose:
  * run it inside a background job — a tool call still takes 1-2 min, which
    would blow an HTTP / Cloudflare timeout;
  * composite the real brand logo afterwards — OpenAI's own docs say the model
    "may struggle to maintain visual consistency for brand elements", so we
    never trust it to draw the mark.
"""
from __future__ import annotations

import base64
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI

from app.core.config import settings

MEDIA_DIR = Path(__file__).resolve().parents[2] / "media" / "generated"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

_INSTRUCTIONS = (
    "You are the image assistant inside a marketing platform. The user either describes an "
    "image they want or asks for a change to the image already in this conversation. Always "
    "produce the result with the image_generation tool.\n\n"
    "Prompt craft (you revise the user's words before generating):\n"
    "- Real photograph by default — natural light, real texture, believable depth of field — "
    "unless they clearly ask for illustration, 3D, vector or a diagram.\n"
    "- Keep every concrete thing the user named: subject and action, setting, props, colours, "
    "mood, composition, and any social-media icons, app screens or connecting graphics they "
    "asked for. This image model renders clean icons, tasteful interface panels and short "
    "exact text well — do not strip those requests.\n"
    "- Describe any on-screen interface as if it already exists and is well designed, not as "
    "'a mockup of'. Only render text the user explicitly asked to appear, in the exact words "
    "they gave, once.\n"
    "- NEVER invent, draw or place a company logo, brand name, wordmark or made-up UI brand. "
    "Leave the natural spot for it clean and unobstructed — the real brand logo is composited "
    "onto the image afterwards by the platform.\n"
    "{brand}\n"
    "For an edit: change only what the user asked; keep the subject, identity, framing, "
    "colours and every other detail exactly as they are.\n\n"
    "You MUST end every turn with ONE short, friendly plain-text sentence describing what "
    "you made or changed (e.g. 'Here's your market scene with the phone showing all five "
    "channels.'). No markdown, no emojis, no lists."
)


def _friendly(msg: str) -> str:
    low = msg.lower()
    if "insufficient_quota" in low or "credit" in low or "billing" in low:
        return "The OpenAI account is out of credits. Add credits, then try again."
    if "rate limit" in low or "429" in low:
        return "OpenAI is rate-limiting right now — wait a moment and try again."
    if "must be verified" in low or ("organization" in low and "verif" in low):
        return "The OpenAI organisation needs to be verified for image generation (console → Settings → Organization)."
    if "moderation_blocked" in low or "content_policy" in low or "safety" in low:
        return "That request was blocked by OpenAI's content policy — try rephrasing it."
    if "previous_response" in low or "response not found" in low:
        return "__retry_no_prev__"  # sentinel: retry without the conversation link
    return msg[:400]


def _data_url(path: str) -> Optional[str]:
    p = Path(path)
    if not p.is_file():
        return None
    ext = p.suffix.lower().lstrip(".") or "png"
    if ext == "jpg":
        ext = "jpeg"
    return f"data:image/{ext};base64," + base64.b64encode(p.read_bytes()).decode()


async def run_turn(
    instruction: str,
    *,
    attachment_path: Optional[str] = None,
    previous_path: Optional[str] = None,
    previous_response_id: Optional[str] = None,
    brand_colors: Optional[List[str]] = None,
    draft: bool = False,
) -> Dict[str, Any]:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required for image generation")

    image_model = settings.OPENAI_IMAGE_MODEL_FAST if draft else settings.OPENAI_IMAGE_MODEL
    brand_line = (
        f"Where it fits the design, lean on this brand colour palette: {', '.join(brand_colors)}."
        if brand_colors
        else "The user has not set brand colours."
    )
    instructions = _INSTRUCTIONS.format(brand=brand_line)

    # content parts: the text, plus any images the model should work from
    content: List[Dict[str, Any]] = [{"type": "input_text", "text": instruction}]
    used_base = "none"
    if attachment_path:
        du = _data_url(attachment_path)
        if du:
            content.append({"type": "input_image", "image_url": du})
            used_base = "attachment"
    # only send the previous image explicitly when we can't link the conversation
    if not previous_response_id and previous_path:
        du = _data_url(previous_path)
        if du:
            content.append({"type": "input_image", "image_url": du})
            used_base = "previous"
    if previous_response_id and used_base == "none":
        used_base = "previous"

    tool: Dict[str, Any] = {
        "type": "image_generation",
        "model": image_model,
        "quality": "high",
        "size": "auto",
        "moderation": "auto",
    }

    client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=540.0, max_retries=1)

    def _call(prev_id: Optional[str]) -> Any:
        kwargs: Dict[str, Any] = dict(
            model=settings.OPENAI_IMAGE_ORCHESTRATOR_MODEL,
            instructions=instructions,
            input=[{"role": "user", "content": content}],
            tools=[tool],
        )
        if prev_id:
            kwargs["previous_response_id"] = prev_id
        return client.responses.create(**kwargs)

    import asyncio

    try:
        resp = await asyncio.to_thread(_call, previous_response_id)
    except Exception as exc:  # noqa: BLE001
        friendly = _friendly(str(exc))
        if friendly == "__retry_no_prev__":
            try:
                resp = await asyncio.to_thread(_call, None)
            except Exception as exc2:  # noqa: BLE001
                raise RuntimeError(_friendly(str(exc2)))
        else:
            raise RuntimeError(friendly)

    calls = [o for o in resp.output if getattr(o, "type", None) == "image_generation_call"]
    if not calls or not getattr(calls[0], "result", None):
        spoken = (getattr(resp, "output_text", "") or "").strip()
        raise RuntimeError(spoken or "The model didn't return an image — try rephrasing the request.")

    call = calls[0]
    b64 = call.result
    asset_id = uuid.uuid4().hex
    (MEDIA_DIR / f"{asset_id}.png").write_bytes(base64.b64decode(b64))

    operation = "edit" if used_base != "none" else "generate"
    reply = (getattr(resp, "output_text", "") or "").strip().strip('"')
    if not reply:
        reply = "Updated." if operation == "edit" else "Here's your image."
    return {
        "id": asset_id,
        "url": f"/media/generated/{asset_id}.png",
        "prompt": getattr(call, "revised_prompt", "") or instruction,
        "size": getattr(call, "size", "auto") or "auto",
        "quality": "high",
        "model": image_model,
        "reply": reply,
        "operation": operation,
        "used_base": used_base,
        "response_id": resp.id,
    }
