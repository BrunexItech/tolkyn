from typing import List, Optional

from pydantic import BaseModel


class Overview(BaseModel):
    provider: str
    window_days: int
    connected: List[str]
    reach: int
    reach_delta: float
    engaged: int
    engagement_rate: float
    engagement_delta: float
    followers: int
    followers_delta: float
    new_followers: int
    profile_views: int = 0
    posts_published: int
    avg_reach_per_post: int


class SeriesPoint(BaseModel):
    date: str
    label: str
    reach: int
    engaged: int
    impressions: int


class TimeSeries(BaseModel):
    points: List[SeriesPoint]
    provider: str = "modelled"


class PlatformRow(BaseModel):
    platform: str
    handle: Optional[str] = None
    followers: int
    followers_delta: float
    reach: int
    engagement_rate: float
    posts: int
    best_time: str


class PlatformList(BaseModel):
    items: List[PlatformRow]


class TopPost(BaseModel):
    id: str
    platform: str
    platforms: List[str]
    text: str
    published_at: Optional[str] = None
    reach: int
    engagement_rate: float
    likes: int
    comments: int
    shares: int


class TopPostList(BaseModel):
    items: List[TopPost]
