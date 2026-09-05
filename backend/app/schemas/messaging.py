from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class BroadcastChannel(str, Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"


class BroadcastStatus(str, Enum):
    DRAFT = "draft"
    SENDING = "sending"
    SENT = "sent"
    PARTIAL = "partial"
    FAILED = "failed"


class Recipient(BaseModel):
    name: Optional[str] = None
    phone: str
    source: Optional[str] = "manual"


class BroadcastCreate(BaseModel):
    channel: BroadcastChannel = BroadcastChannel.SMS
    name: str = Field(..., min_length=1, max_length=200)
    body: str = ""
    recipients: List[Recipient] = []
    scheduled_at: Optional[datetime] = None


class BroadcastUpdate(BaseModel):
    channel: Optional[BroadcastChannel] = None
    name: Optional[str] = None
    body: Optional[str] = None
    recipients: Optional[List[Recipient]] = None
    scheduled_at: Optional[datetime] = None


class BroadcastResponse(BaseModel):
    id: str
    channel: BroadcastChannel
    status: BroadcastStatus
    name: str
    body: str
    recipients: List[Dict[str, Any]]
    total: int
    sent_count: int
    failed_count: int
    results: List[Dict[str, Any]]
    provider: Optional[str] = None
    simulated: int
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BroadcastList(BaseModel):
    items: List[BroadcastResponse]


class ContactRow(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    phone: str
    country: Optional[str] = None
    source: str
    ref_id: Optional[str] = None


class ContactList(BaseModel):
    items: List[ContactRow]


class CsvImportResult(BaseModel):
    recipients: List[Recipient]
    imported: int
    skipped: int
    columns: List[str] = []


class MessagingSummary(BaseModel):
    sms_broadcasts: int
    whatsapp_broadcasts: int
    messages_sent: int
    messages_failed: int
    sms_provider: str
    whatsapp_provider: str


# ---- self-hosted WhatsApp Web sessions (Baileys worker) -------------------
class WhatsAppWebStatus(BaseModel):
    status: str  # disconnected | connecting | qr | connected | logged_out
    qr: Optional[str] = None  # data: URL PNG, present only while status == "qr"
    phone: Optional[str] = None  # E.164, present only once connected


class WhatsAppWebMessageWebhook(BaseModel):
    workspace_id: str
    external_id: str
    from_: str = Field(alias="from")  # stable per-conversation key (addressing JID digits)
    from_jid: Optional[str] = None  # exact WhatsApp identity to reply to (may be "<n>@lid")
    from_pn: Optional[str] = None  # genuine E.164 when WhatsApp disclosed it — display only
    from_name: Optional[str] = None
    body: str
    at: int  # epoch ms

    model_config = {"populate_by_name": True}


class WhatsAppWebStatusWebhook(BaseModel):
    workspace_id: str
    status: str


class WhatsAppWebHistoryMessage(BaseModel):
    external_id: str
    contact: str  # stable per-conversation key (addressing JID digits)
    contact_jid: Optional[str] = None  # exact WhatsApp identity to reply to
    contact_pn: Optional[str] = None  # genuine E.164 when known — display only
    contact_name: Optional[str] = None
    direction: str  # "in" | "out"
    body: str
    at: int  # epoch ms


class WhatsAppWebHistoryWebhook(BaseModel):
    workspace_id: str
    messages: List[WhatsAppWebHistoryMessage]
    phone: Optional[str] = None


# ---- Campaign groups ("communities") — shared conversation, masked identity
class CampaignRecipient(BaseModel):
    phone: str
    name: Optional[str] = None


class CampaignGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    recipients: List[CampaignRecipient] = Field(..., min_length=1)
    initial_message: str = ""


class CampaignGroupParticipantRow(BaseModel):
    id: str
    phone: str  # real identity — this response is admin-only, never sent to other participants
    real_name: Optional[str] = None
    pseudo_name: str

    model_config = {"from_attributes": True}


class CampaignGroupMessageRow(BaseModel):
    id: str
    participant_id: Optional[str] = None
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CampaignGroupResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    participants: List[CampaignGroupParticipantRow] = []

    model_config = {"from_attributes": True}


class CampaignGroupDetail(CampaignGroupResponse):
    messages: List[CampaignGroupMessageRow] = []
    send_errors: List[str] = []  # only ever populated right after sending a message


class CampaignGroupList(BaseModel):
    items: List[CampaignGroupResponse]


class CampaignGroupCreateResult(BaseModel):
    group: CampaignGroupResponse
    send_errors: List[str] = []


class CampaignGroupSendMessage(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
