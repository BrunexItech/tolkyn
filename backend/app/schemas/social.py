from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class ConnectionStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class ConnectionResponse(BaseModel):
    id: str
    platform: str
    status: ConnectionStatus
    handle: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    followers: Optional[int] = None
    scopes: List[str] = []
    needs_reauth: bool = False
    connected_at: Optional[datetime] = None
    last_synced_at: Optional[datetime] = None
    last_error: Optional[str] = None
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConnectionList(BaseModel):
    items: List[ConnectionResponse]
    connected: List[str]
    provider: str = "upload_post"
    configured: bool = True


class ConnectRequest(BaseModel):
    platform: str


class ConnectStartResponse(BaseModel):
    authorize_url: str
    state: Optional[str] = None
    expires_in: Optional[int] = None


class HostedConnectResponse(BaseModel):
    url: str
