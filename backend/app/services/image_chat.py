"""Conversational image generation — reads a natural-language instruction
(plus an optional freshly-attached photo and the previous result in the thread)
and figures out exactly what to do, ChatGPT-style: generate, edit, enhance,
restyle, remove background, turn a photo into a logo, or refine the last image.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.ai_client import ai
from app.services.content_ai import generate_image, strip_emoji

_SIZES = {"1024x1024", "1024x1536", "1536x1024"}

_SYSTEM = (
    "You are the planner for a conversational image tool that behaves like ChatGPT's image "
    "feature. The user types a natural request. Read their intent and decide exactly what to "
    "do, then write the prompt for the image model.\n\n"
    "You are told: the new instruction, whether the user JUST ATTACHED a photo, whether a "
    "PREVIOUS image made by the tool exists in this chat, and the recent turns.\n\n"
    "Return JSON:\n"
    '- "base": "attachment" | "previous" | "none"\n'
    "    attachment  -> they mean the photo they just attached (edit it, enhance it, restyle "
    "it, remove its background, put it on a mockup, turn it into a logo).\n"
    "    previous    -> they are refining the tool's last image (\"make it darker\", \"now "
    "square\", \"add our name\", \"warmer palette\", \"try another version\").\n"
    "    none        -> a brand-new image from scratch.\n"
    '- "prompt": the full, vivid instruction for the image model.\n'
    "    * For a NEW image from scratch, default to a REAL PHOTOGRAPH unless the user asked "
    "for illustration / vector / flat / cartoon / 3D / painting / logo. Write it like a "
    "photographer would: name the camera and lens feel (e.g. 'shot on a full-frame camera, "
    "35mm f/1.8'), the light (soft window light, golden hour, studio key), depth of field, "
    "and real texture — skin pores and fine lines, fabric weave, material grain, subtle "
    "imperfections, true colour. It must look like something a professional actually shot, "
    "not an AI render. End the prompt with: 'Not an illustration or 3D render; no plastic "
    "or airbrushed look; no AI artefacts.'\n"
    "    * For an EDIT, be explicit about preservation: e.g. \"Keep the subject, pose, "
    "framing, proportions and every existing detail exactly as in the source image. Only "
    "<the requested change>.\" Do not re-describe or re-imagine the subject.\n"
    '    * For "enhance": "Improve sharpness, lighting, colour accuracy and fine detail. '
    "Keep the subject, composition, framing and background identical - do not add, remove "
    'or move anything."\n'
    '    * For a logo: clean, simple, balanced, centered, reads at small sizes.\n'
    "    Be concrete. Never use emojis.\n"
    '- "size": "1024x1024" (default), "1024x1536" (stories, posters, portraits), '
    '"1536x1024" (banners, covers, wide mockups). For an edit, match the source\'s '
    "orientation unless the user asks to change it.\n"
    '- "quality": always "high" unless the user explicitly asks for a quick/rough/draft '
    'version, then "low".\n'
    '- "transparent": true only when they ask for a transparent background / cutout / a '
    "logo with no background.\n"
    '- "reply": one short friendly sentence describing what you are doing. No emojis.'
)


async def run_turn(
    instruction: str,
    *,
    has_attachment: bool,
    has_previous: bool,
    attachment_path: Optional[str] = None,
    previous_path: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    extra_prompt: Optional[str] = None,
) -> Dict[str, Any]:
    client = ai()

    plan: Dict[str, Any] = {
        "base": "attachment" if has_attachment else ("previous" if has_previous else "none"),
        "prompt": instruction,
        "size": "1024x1024",
        "quality": "high",
        "transparent": False,
        "reply": "On it.",
    }

    if client.available:
        turns = ""
        for h in (history or [])[-5:]:
            role = h.get("role", "user")
            turns += f"\n{role}: {h.get('text', '')}".rstrip()
        user = (
            f"New instruction: {instruction}\n"
            f"User just attached a photo: {'yes' if has_attachment else 'no'}\n"
            f"A previous tool image exists: {'yes' if has_previous else 'no'}\n"
            f"Recent chat:{turns or ' (none)'}"
        )
        try:
            data = await client.json(_SYSTEM, user, temperature=0.4, max_tokens=550)
            for k in ("base", "prompt", "size", "quality", "transparent", "reply"):
                v = data.get(k)
                if v not in (None, ""):
                    plan[k] = v
        except Exception as exc:  # noqa: BLE001
            print(f"[image_chat] planning failed: {exc}")

    # ---- resolve the base image -------------------------------------
    base = str(plan.get("base") or "none")
    base_path: Optional[str] = None
    if base == "attachment" and attachment_path:
        base_path = attachment_path
    elif base == "previous" and previous_path:
        base_path = previous_path
    # sensible fallbacks: a fresh attachment is almost always the subject;
    # otherwise a "refine" with no attachment means the previous image.
    if base_path is None:
        if has_attachment and attachment_path:
            base_path = attachment_path
            base = "attachment"
        elif has_previous and previous_path:
            base_path = previous_path
            base = "previous"

    size = plan["size"] if plan.get("size") in _SIZES else "1024x1024"
    quality = plan["quality"] if plan.get("quality") in ("low", "medium", "high") else "high"
    prompt = strip_emoji(str(plan.get("prompt") or instruction)).strip() or instruction
    # non-negotiable directions (e.g. "leave room for the brand logo, draw
    # none of your own") that the planner must not paraphrase away
    if extra_prompt:
        prompt = f"{prompt}\n\n{extra_prompt.strip()}"

    result = await generate_image(
        prompt,
        size=size,
        quality=quality,
        input_image_path=base_path,
        input_fidelity="high",  # keep the source image faithful on edits
        background="transparent" if plan.get("transparent") else "auto",
    )
    result["reply"] = strip_emoji(str(plan.get("reply") or "Here you go.")).strip()
    result["operation"] = "edit" if base_path else "generate"
    result["used_base"] = base if base_path else "none"
    return result
