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
_PLANNER_MODEL = "gpt-5.6-luna"
_ARCHITECT_MODEL = "gpt-5.6-luna"

import re as _re

_WIDE_RE = _re.compile(
    r"\b(banner|cover|header|hero|landscape|wide|16[:x]9|widescreen|billboard|"
    r"thumbnail|desktop|ad\b|advert|advertising|campaign|website|web page|blog)\b",
    _re.I,
)
_TALL_RE = _re.compile(
    r"\b(story|stories|reel|portrait|vertical|9[:x]16|poster|phone wallpaper|"
    r"pinterest|tiktok|instagram story)\b",
    _re.I,
)


def _guess_size(text: str) -> str:
    if _TALL_RE.search(text or ""):
        return "1024x1536"
    if _WIDE_RE.search(text or ""):
        return "1536x1024"
    return "1024x1024"


# A long, maximalist or self-contradicting brief ("show the dashboard with
# social media, CRM, analytics, a call center… and readable UI… and clean
# white space… and our exact logo… and a tagline"). Sending that verbatim
# makes the model average 20 demands into mush. The architect keeps every
# concrete visual detail but resolves the conflicts and drops the asks no
# image model can do — the same thing ChatGPT does silently before it calls
# the image model.
_HARD_ASK_RE = _re.compile(
    r"\b(legible|readable|read(?:s|able)? clearly|text reads?|actual text|real text|"
    r"\bUI\b|user interface|interface (?:show|display)|dashboard (?:show|display|with|of)|"
    r"screen (?:show|display|with)|mock-?up of (?:the|a|an) (?:app|dashboard|screen|platform)|"
    r"exact logo|logo (?:exactly )?as (?:provided|shown|attached|given)|official logo|"
    r"brand identity|\btagline\b|\bslogan\b|central message|the (?:words?|message|phrase)[:\"'])",
    _re.I,
)

_ARCHITECT_SYSTEM = (
    "You take an over-long or internally-conflicting image brief and rewrite it into ONE "
    "clean prompt that a modern image model (gpt-image-2) will render beautifully — exactly "
    "the way ChatGPT quietly rewrites a messy prompt before it generates.\n\n"
    "KEEP everything that makes the image what the user wants: the concept and story, the "
    "mood, the specific subject and what they are doing, the setting and the real props, the "
    "colour palette, the lighting and camera direction, the composition, the specific people "
    "or place, every concrete visual detail they named.\n\n"
    "FIX silently:\n"
    "- Resolve contradictions (e.g. 'lots of clean white space' + 'show ten features at "
    "once' -> commit to the stronger reading).\n"
    "- Replace impossible asks. A screen or dashboard showing legible app UI -> 'the laptop "
    "screen shows a softly out-of-focus dashboard: coloured charts, a chat list and a blue "
    "accent, individual labels not readable'. 'Render the exact brand logo' / a tagline / "
    "on-image slogan text -> DROP it entirely (the real logo is composited afterwards; "
    "taglines are added later in a design tool).\n"
    "- Lead with the main subject in the first sentence.\n"
    "- Trim to ONE flowing paragraph, roughly 110-180 words. A real photograph by default "
    "unless the brief clearly asks for illustration/3D/vector.\n\n"
    "DO NOT genericise, DO NOT drop concrete detail, DO NOT add stock adjectives ('sleek', "
    "'vibrant', 'bustling', 'cutting-edge', 'state-of-the-art'), DO NOT change the creative "
    "idea, DO NOT start with 'Generate' / 'Create' / 'An image of'.\n\n"
    'Return JSON: {"prompt": "<the rewritten paragraph>", "size": "1024x1024" | "1536x1024" '
    '(wide / banner / campaign) | "1024x1536" (portrait / story / poster), "reply": "<one '
    'short friendly sentence on what you are making, no emojis>"}'
)


async def _architect(instruction: str) -> Optional[Dict[str, Any]]:
    """Rewrite a maximalist brief into a coherent, image-model-friendly prompt.
    Returns None on any failure (caller then falls back to the raw instruction)."""
    client = ai()
    if not client.available:
        return None
    try:
        data = await client.json(
            _ARCHITECT_SYSTEM,
            f'Rewrite this image brief:\n\n"{instruction.strip()}"',
            temperature=0.5,
            max_tokens=1100,
            model=_ARCHITECT_MODEL,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[image_chat] architect failed: {exc}")
        return None
    prompt = strip_emoji(str(data.get("prompt") or "")).strip()
    if len(prompt) < 60:
        return None
    size = data.get("size") if data.get("size") in _SIZES else None
    reply = strip_emoji(str(data.get("reply") or "")).strip()
    return {"prompt": prompt, "size": size, "reply": reply}

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
    '- "prompt": the instruction for the image model.\n'
    "    * If you were told the user's instruction ALREADY reads as a finished detailed "
    "prompt: return it essentially unchanged — fix only obvious typos, never rewrite, "
    "shorten or genericise it. Their wording is deliberate.\n"
    "    * If you were told to EXPAND a short/vague idea: write a rich, specific prompt the "
    "way ChatGPT would — a full, flowing paragraph (3-6 sentences), not one line. Default "
    "to a REAL PHOTOGRAPH unless they asked for illustration / vector / flat / cartoon / 3D "
    "/ painting / logo. Name: the subject and exactly what it's doing; the shot type and "
    "composition; the setting and specific props; the camera and lens feel ('shot on a "
    "full-frame camera, 35mm f/1.8'); the light and time of day; depth of field; and real "
    "texture (skin pores, fabric weave, material grain, subtle imperfections, true colour). "
    "It must read as something a professional actually shot. End with: 'Not an illustration "
    "or 3D render; no plastic or airbrushed look; no AI artefacts.'\n"
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

    # If the user has clearly written their own finished prompt (a fresh
    # generation, and something detailed — not "a coffee cup"), we send it to
    # the image model VERBATIM, exactly like pasting it into ChatGPT. The
    # planner only enriches short / vague ideas.
    words = len(instruction.split())
    user_wrote_prompt = (
        not has_attachment
        and not has_previous
        and (words >= 12 or (words >= 7 and ("," in instruction or "." in instruction.strip(" ."))))
    )

    plan: Dict[str, Any] = {
        "base": "attachment" if has_attachment else ("previous" if has_previous else "none"),
        "prompt": instruction,
        "size": "1024x1024",
        "quality": "high",
        "transparent": False,
        "reply": "On it.",
    }

    # A fresh, long or self-conflicting brief goes through the architect first —
    # it becomes a single coherent prompt we then send verbatim (like ChatGPT
    # rewriting your prompt before it draws). Short ideas skip this and hit the
    # planner instead; edits/refinements never touch it.
    architected = False
    if (
        not has_attachment
        and not has_previous
        and words >= 25
        and (words >= 55 or _HARD_ASK_RE.search(instruction))
    ):
        arch = await _architect(instruction)
        if arch:
            architected = True
            user_wrote_prompt = True  # the architect's output is final
            plan["prompt"] = arch["prompt"]
            if arch["size"]:
                plan["size"] = arch["size"]
            if arch["reply"]:
                plan["reply"] = arch["reply"]

    if client.available and not architected:
        turns = ""
        for h in (history or [])[-5:]:
            role = h.get("role", "user")
            turns += f"\n{role}: {h.get('text', '')}".rstrip()
        user = (
            f"New instruction: {instruction}\n"
            f"User just attached a photo: {'yes' if has_attachment else 'no'}\n"
            f"A previous tool image exists: {'yes' if has_previous else 'no'}\n"
            f"The user's instruction already reads as a finished, detailed prompt: "
            f"{'yes — keep it as the prompt, only fix obvious typos' if user_wrote_prompt else 'no — expand it into a rich, specific prompt'}\n"
            f"Recent chat:{turns or ' (none)'}"
        )
        try:
            data = await client.json(_SYSTEM, user, temperature=0.4, max_tokens=700, model=_PLANNER_MODEL)
            keys = ("base", "size", "quality", "transparent", "reply")
            if not user_wrote_prompt:
                keys = keys + ("prompt",)
            for k in keys:
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

    size = plan["size"] if plan.get("size") in _SIZES else _guess_size(instruction)
    prompt = strip_emoji(str(plan.get("prompt") or instruction)).strip() or instruction
    # non-negotiable directions (e.g. "leave room for the brand logo, draw
    # none of your own") that the planner must not paraphrase away
    if extra_prompt:
        prompt = f"{prompt}\n\n{extra_prompt.strip()}"

    # A busy, wordy scene at "high" adds minutes of render time for little
    # visible gain (and risks a gateway/OpenAI timeout). "medium" on
    # gpt-image-2 is near-identical there. Clean/short prompts keep "high".
    quality = "medium" if len(prompt) > 1200 else "high"

    result = await generate_image(
        prompt,
        size=size,
        quality=quality,
        input_image_path=base_path,
        input_fidelity="high",  # keep the source image faithful on edits
        background="transparent" if plan.get("transparent") else "auto",
        # a prompt the user wrote, or one the architect finalised, goes to the
        # model verbatim — no extra photo boilerplate on top. The logo
        # directive (extra_prompt) is an instruction, not style, so it doesn't
        # disable passthrough.
        passthrough=(user_wrote_prompt or architected),
    )
    result["reply"] = strip_emoji(str(plan.get("reply") or "Here you go.")).strip()
    result["operation"] = "edit" if base_path else "generate"
    result["used_base"] = base if base_path else "none"
    return result
