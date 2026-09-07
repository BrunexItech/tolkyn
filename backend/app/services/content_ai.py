"""AI content generation for the Content Studio: copy, images, video plans."""
import base64
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI

from app.core.config import settings
from app.services.ai_client import ai

MEDIA_DIR = Path(__file__).resolve().parents[2] / "media" / "generated"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

# strips emoji / pictographs / dingbats / symbols and the variation selectors + ZWJ
_EMOJI_RE = re.compile(
    "["
    "\U0001F000-\U0001FAFF"  # symbols, pictographs, emoticons, transport, supplemental
    "\U00002600-\U000027BF"  # misc symbols + dingbats
    "\U0001F1E6-\U0001F1FF"  # regional indicators (flags)
    "\U00002190-\U000021FF"  # arrows
    "\U00002B00-\U00002BFF"  # misc symbols and arrows
    "\U0000FE00-\U0000FE0F"  # variation selectors
    "\U0000200D"             # zero-width joiner
    "\U00002022"             # bullet
    "\U000024C2"
    "\U0000203C\U00002049"
    "]+",
    flags=re.UNICODE,
)


def strip_emoji(text: str) -> str:
    if not text:
        return text
    out = _EMOJI_RE.sub("", text)
    out = re.sub(r"[ \t]{2,}", " ", out)          # collapse gaps left behind
    out = re.sub(r" +\n", "\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


_PLATFORM_HINTS = {
    "instagram": "Instagram caption: a real hook in the first line, then 2-4 short lines of substance. 3-5 genuinely relevant hashtags at the end.",
    "tiktok": "TikTok caption: one or two sharp lines that set up the video. 3-4 relevant hashtags.",
    "x": "X post: one tight thought, under 280 characters, no wind-up. At most 1 hashtag, only if it adds something.",
    "linkedin": "LinkedIn post: a clear point of view or a specific lesson, written in short plain paragraphs. 0-2 hashtags.",
    "facebook": "Facebook post: talk to one person, plain and warm, end with a real question or a clear next step.",
    "youtube": "YouTube description: 2-3 plain sentences on what the video covers and who it's for, then a line for links.",
}

_COPY_SYSTEM = (
    "You are a working social copywriter who sounds like a real person, not a brand bot.\n"
    "Hard rules:\n"
    "- NEVER use emojis or emoticons. Not one.\n"
    "- No marketing clichés: no 'unlock', 'elevate', 'game-changer', 'changes the game', "
    "'dive in', \"in today's fast-paced world\", \"we're excited to\", 'look no further', "
    "'the secret to', 'take it to the next level', 'unleash', 'supercharge', 'revolutionary', "
    "'seamless', 'boost your sales', 'watch your business grow', 'say goodbye to', "
    "'make every ... count', 'we've got your back', 'we hear you'.\n"
    "- No em-dashes for drama, no rhetorical question openers, no 'It's not just X, it's Y', "
    "no ending on a slogan.\n"
    "- Vary sentence length. Use plain words. Contractions are fine. It can be a little "
    "imperfect the way a person writes.\n"
    "- Be concrete and specific to the brief. No invented statistics. No hashtag stuffing.\n"
    "Return ONLY JSON."
)


async def _copy_for_platform(
    client, prompt: str, platform: str, count: int, tone: str
) -> List[Dict[str, Any]]:
    hint = _PLATFORM_HINTS.get(platform, "General social post: concise, specific, human.")
    user = (
        f"Brief: {prompt}\nPlatform: {platform} — {hint}\nTone: {tone}\n\n"
        f'Write {count} distinct option(s), each a different angle on the brief. '
        f'Return JSON: {{"variants": [{{"text": string (the post, no emojis), '
        f'"hashtags": [string], "angle": short label}}]}}.'
    )
    try:
        data = await client.json(_COPY_SYSTEM, user, temperature=0.85, max_tokens=1100)
    except Exception as exc:  # noqa: BLE001
        print(f"[content_ai] copy failed for {platform}: {exc}")
        return []
    out: List[Dict[str, Any]] = []
    for v in (data.get("variants") or [])[:count]:
        text = strip_emoji((v.get("text") or "").strip())
        tags = [strip_emoji(str(h)).lstrip("#") for h in (v.get("hashtags") or [])]
        tags = [f"#{t}" for t in tags if t]
        out.append({"text": text, "hashtags": tags, "angle": v.get("angle", ""), "chars": len(text)})
    return out


async def generate_copy(
    prompt: str,
    platforms: List[str],
    *,
    count: int = 2,
    tone: str = "confident, friendly",
) -> Dict[str, Any]:
    platforms = platforms or ["instagram"]
    client = ai()
    if not client.available:
        return {
            "results": [
                {"platform": p, "variants": [{"text": prompt, "hashtags": [], "angle": "", "chars": len(prompt)}]}
                for p in platforms
            ],
            "generated_by": "none",
        }
    results = []
    for p in platforms:
        variants = await _copy_for_platform(client, prompt, p, count, tone)
        results.append({"platform": p, "variants": variants})
    return {"results": results, "generated_by": "gpt-4o-mini"}


_LOGO_HINT = (
    " Produce a clean, production-ready logo: simple, scalable, centered on a plain "
    "background, high contrast, no photographic clutter."
)


_PROMPT_IMAGE_SYSTEM = (
    "You are a senior photographer and art director writing prompts for a modern image "
    "model. Turn a rough idea into ONE precise, vivid, ready-to-paste prompt.\n\n"
    "DEFAULT TO A REAL PHOTOGRAPH. Unless the user clearly asks for illustration, vector, "
    "flat, cartoon, anime, 3D render, painting, sketch, watercolour or a logo, write the "
    "prompt as a photograph and include concrete photographic detail: the camera and lens "
    "feel (e.g. 'shot on a full-frame camera, 35mm f/1.8' or '85mm portrait lens'), the "
    "light (soft window light, overcast, golden hour, hard studio key, practical lights), "
    "depth of field, and realistic surface detail — natural skin texture with pores and "
    "fine lines, fabric weave, real material reflections, subtle imperfections, true-to-life "
    "colour. It should read as something a professional actually shot, not an AI render.\n\n"
    "Cover in one or two natural sentences: the subject and what it's doing, the shot type "
    "and composition, the setting, the light and time of day, the colour and mood. Be "
    "concrete, never flowery. No lists, no '4k, ultra detailed, trending on artstation' "
    "filler. If the user wants a non-photo style, commit to that style fully and skip the "
    "camera talk. Never use emojis. Return ONLY JSON."
)

# Style words that mean the user deliberately wants a NON-photographic look —
# don't force realism onto these.
_NON_PHOTO_RE = re.compile(
    r"\b(illustrat|vector|flat design|flat-design|cartoon|anime|manga|3d render|3-d|cgi|"
    r"render(ed|ing)?|low.?poly|pixel art|painting|painted|oil painting|watercolou?r|gouache|"
    r"sketch|line art|line-art|doodle|drawing|comic|logo|wordmark|icon set|isometric|"
    r"claymation|papercraft|pop art|abstract|surreal|minimalist poster|risograph|woodcut)\b",
    re.I,
)

_PHOTO_SUFFIX = (
    " Photographic and true to life: shot on a full-frame camera with a fast prime lens, "
    "natural directional light, real depth of field, authentic textures (skin pores, fabric "
    "weave, material grain), accurate colour and subtle imperfections. Not an illustration, "
    "not a 3D render, no plastic or airbrushed look, no visible AI artefacts."
)


def _photoreal_wrap(prompt: str, style: str, *, as_logo: bool, is_edit: bool) -> str:
    """Append photo-realism direction unless this is a logo, an edit, or the
    user has clearly asked for a non-photographic style."""
    if as_logo or is_edit:
        return prompt
    blob = f"{prompt} {style}".lower()
    if _NON_PHOTO_RE.search(blob):
        return prompt
    # already asking for a photo? still fine to reinforce, but keep it short
    return f"{prompt}.{_PHOTO_SUFFIX}"
_PROMPT_VIDEO_SYSTEM = (
    "You are a short-form video director. Turn a rough idea into ONE precise prompt for a "
    "video model: the core action and subject, camera movement, framing, setting, lighting "
    "and mood, pacing, and visual style. One or two sentences, concrete. Never use emojis. "
    "Return ONLY JSON."
)


async def build_prompt(intent: str, brief: str) -> Dict[str, Any]:
    """Turn a rough idea into a polished, ready-to-use generation prompt."""
    client = ai()
    if not client.available:
        return {"prompt": brief, "negative_prompt": "", "notes": "", "style_tips": []}

    system = _PROMPT_IMAGE_SYSTEM if intent == "image" else _PROMPT_VIDEO_SYSTEM
    user = (
        f'Rough idea from the user:\n"{brief}"\n\n'
        'Return JSON:\n'
        '- "prompt": the finished, ready-to-paste prompt (1-2 sentences, no line breaks)\n'
        '- "negative_prompt": short comma list of things to avoid, or "" \n'
        '- "style_tips": 3-4 SHORT alternative style directions (e.g. "editorial photo, '
        'natural window light", "bold flat vector", "moody cinematic, 35mm"). Each is a '
        'phrase that could be appended to the prompt.\n'
        '- "notes": at most one line of practical advice (aspect ratio, what to tweak).'
    )
    try:
        data = await client.json(system, user, temperature=0.7, max_tokens=600)
    except Exception as exc:  # noqa: BLE001
        print(f"[content_ai] build_prompt failed: {exc}")
        return {"prompt": brief, "negative_prompt": "", "notes": "", "style_tips": []}

    data["prompt"] = strip_emoji(str(data.get("prompt") or brief)).strip()
    data["negative_prompt"] = strip_emoji(str(data.get("negative_prompt") or ""))
    tips = data.get("style_tips") or []
    data["style_tips"] = [strip_emoji(str(t)).strip() for t in tips if str(t).strip()][:4]
    data["notes"] = strip_emoji(str(data.get("notes") or ""))
    return data


_IMAGE_MINI_MODEL = "gpt-image-1-mini"
_VALID_SIZES = {"1024x1024", "1024x1536", "1536x1024", "auto"}


async def generate_image(
    prompt: str,
    *,
    size: str = "1024x1024",
    quality: str = "high",
    style: str = "",
    draft: bool = False,
    input_image_path: str | None = None,
    input_fidelity: str = "high",
    as_logo: bool = False,
    background: str = "auto",
) -> Dict[str, Any]:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required for image generation")
    if size not in _VALID_SIZES:
        size = "1024x1024"
    if quality not in ("low", "medium", "high"):
        quality = "high"
    if background not in ("auto", "transparent", "opaque"):
        background = "auto"
    if input_fidelity not in ("high", "low"):
        input_fidelity = "high"

    full_prompt = prompt if not style else f"{prompt}. Style: {style}."
    if as_logo:
        full_prompt += _LOGO_HINT
    else:
        full_prompt = _photoreal_wrap(full_prompt, style, as_logo=as_logo, is_edit=bool(input_image_path))

    model = _IMAGE_MINI_MODEL if draft else settings.OPENAI_IMAGE_MODEL
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def _run() -> str:
        common: Dict[str, Any] = {
            "model": model, "prompt": full_prompt, "size": size, "quality": quality,
        }
        if background != "auto":
            common["background"] = background
        if input_image_path:
            # input_fidelity=high keeps the source image's subject, faces, logos and
            # fine detail intact — only the requested change is applied. (full model only)
            if not draft:
                common["input_fidelity"] = input_fidelity
            with open(input_image_path, "rb") as fh:
                res = client.images.edit(image=fh, **common)
        else:
            res = client.images.generate(n=1, **common)
        item = res.data[0]
        if getattr(item, "b64_json", None):
            return item.b64_json
        import httpx

        img = httpx.get(item.url, timeout=60).content
        return base64.b64encode(img).decode()

    import asyncio

    try:
        b64 = await asyncio.to_thread(_run)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        low = msg.lower()
        if "insufficient_quota" in low or "credit_balance_exhausted" in low or "no credits remaining" in low:
            raise RuntimeError(
                "The OpenAI account is out of credits. Add credits at "
                "platform.openai.com/settings/organization/billing, then try again."
            )
        if "rate limit" in low or "429" in low:
            raise RuntimeError("OpenAI is rate-limiting right now — wait a moment and try again.")
        if "must be verified" in low or ("organization" in low and "verif" in low):
            raise RuntimeError(
                "Your OpenAI organization needs to be verified for image generation "
                "(OpenAI console → Settings → Organization → Verify)."
            )
        if "content_policy" in low or "safety" in low:
            raise RuntimeError("That request was blocked by OpenAI's content policy — try rephrasing it.")
        raise RuntimeError(msg)

    asset_id = uuid.uuid4().hex
    path = MEDIA_DIR / f"{asset_id}.png"
    path.write_bytes(base64.b64decode(b64))
    return {
        "id": asset_id,
        "url": f"/media/generated/{asset_id}.png",
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "model": model,
        "style": style,
    }


_VEO_PROMPT_SYSTEM = (
    "You turn a short, casual idea into one vivid prompt for an AI video generator (Veo). "
    "Write a single flowing paragraph, plain prose, no markdown, no quotes, no emojis, no "
    "headers or bullet points. Cover in natural sentences: what's in frame and what it's "
    "doing, the setting, camera framing/movement (e.g. close-up, slow dolly, handheld), "
    "lighting and mood, and — if it fits the scene — brief dialogue in quotes or ambient "
    "sound. Be concrete and visual, not abstract. Keep it under 100 words. Never invent a "
    "brand name unless the idea already names one."
)


async def enhance_video_prompt(idea: str, *, brand_colors: Optional[List[str]] = None) -> str:
    """Expands a short, plain-language idea into a well-formed Veo prompt —
    the 'explain your scene simply, we'll write the rest' button."""
    client = ai()
    if not client.available:
        return idea
    hint = f"\nIf natural, you can nod to this color palette in the styling: {', '.join(brand_colors)}." if brand_colors else ""
    user = f"Idea: {idea}{hint}"
    try:
        text = await client.text(_VEO_PROMPT_SYSTEM, user, temperature=0.7, max_tokens=220)
    except Exception as exc:  # noqa: BLE001
        print(f"[content_ai] video prompt enhance failed: {exc}")
        return idea
    text = strip_emoji(text).strip().strip('"')
    return text or idea
