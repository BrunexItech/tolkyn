from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AssetKind(str, Enum):
    COPY = "copy"
    IMAGE = "image"
    VIDEO_PLAN = "video_plan"


class CopyRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=4000)
    platforms: List[str] = Field(default_factory=lambda: ["instagram"], min_length=1, max_length=6)
    count: int = Field(2, ge=1, le=3, description="Variants per channel")
    tone: str = "confident, friendly"
    # A fresh generation is a draft, not a save — persisting a caption is a
    # deliberate, titled action now (see SaveCaptionRequest / POST /captions).
    save: bool = False


class SaveCaptionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    platform: str = Field(..., min_length=1, max_length=40)
    text: str = Field(..., min_length=1, max_length=4000)
    hashtags: List[str] = Field(default_factory=list, max_length=20)
    angle: str = Field("", max_length=120)
    brief: str = Field("", max_length=4000)


class ImageQuality(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ImageRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=6000)
    size: str = "1024x1024"
    quality: ImageQuality = ImageQuality.MEDIUM
    style: str = ""
    draft: bool = Field(False, description="Use the cheaper gpt-image-1-mini model")
    input_image_url: Optional[str] = Field(None, description="An uploaded image to edit / use as a base")
    as_logo: bool = False
    save: bool = True
    brand_logo: Optional[str] = Field(
        None,
        description=(
            "Composite the workspace brand logo onto the result. "
            "'off'/None = never; 'auto' = only if the prompt asks for a logo, "
            "at the spot it names; or an explicit position "
            "(top-left, top-right, bottom-left, bottom-right, center, …)."
        ),
    )


class PromptRequest(BaseModel):
    intent: str = Field("image", pattern="^(image|video)$")
    brief: str = Field(..., min_length=3, max_length=3000)


class PromptResponse(BaseModel):
    prompt: str
    negative_prompt: str = ""
    style_tips: list[str] = []
    notes: str = ""


class CopyVariant(BaseModel):
    text: str
    hashtags: List[str] = []
    angle: str = ""
    chars: int = 0


class CopyGroup(BaseModel):
    platform: str
    variants: List[CopyVariant] = []


class CopyResponse(BaseModel):
    asset_id: Optional[str] = None
    results: List[CopyGroup]
    generated_by: str


class ImageResponse(BaseModel):
    asset_id: Optional[str] = None
    id: str
    url: str
    prompt: str
    size: str
    quality: str = "medium"
    model: str = ""
    style: str = ""
    logo_applied: Optional[str] = Field(None, description="position the brand logo was placed, if any")
    logo_note: Optional[str] = Field(None, description="why the logo wasn't placed, if it was requested")


class ChatTurn(BaseModel):
    role: str = "user"
    text: str = ""


class ImageChatRequest(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=6000)
    attachment_url: Optional[str] = Field(None, description="A photo the user just attached")
    previous_image_url: Optional[str] = Field(None, description="The last image the tool made in this chat")
    history: List[ChatTurn] = Field(default_factory=list, max_length=40)
    brand_logo: Optional[str] = Field(
        None,
        description="off/None, 'auto', or an explicit position — same as ImageRequest.brand_logo",
    )


class ImageChatResponse(BaseModel):
    asset_id: Optional[str] = None
    id: str
    url: str
    prompt: str
    size: str
    quality: str = "medium"
    model: str = ""
    reply: str = ""
    operation: str = "generate"
    used_base: str = "none"
    logo_applied: Optional[str] = None
    logo_note: Optional[str] = None


class AssetResponse(BaseModel):
    id: str
    kind: AssetKind
    prompt: str
    platform: Optional[str] = None
    title: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    image_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetList(BaseModel):
    items: List[AssetResponse]


class ImageJobResponse(BaseModel):
    """Poll target for a background image generation."""
    id: str
    status: str  # queued | processing | succeeded | failed
    mode: str    # generate | chat
    # populated once status == succeeded
    url: Optional[str] = None
    asset_id: Optional[str] = None
    reply: Optional[str] = None
    operation: Optional[str] = None
    used_base: Optional[str] = None
    logo_applied: Optional[str] = None
    logo_note: Optional[str] = None
    error: Optional[str] = None

    model_config = {"from_attributes": True}


class BrandKitResponse(BaseModel):
    brand_logo_url: Optional[str] = None
    brand_colors: Optional[List[str]] = None


class BrandKitUpdate(BaseModel):
    logo_url: str = ""
    colors: List[str] = Field(default_factory=list, max_length=6)
