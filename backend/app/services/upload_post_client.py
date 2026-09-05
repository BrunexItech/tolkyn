"""Thin async wrapper around the Upload-Post REST API.

Docs: https://docs.upload-post.com  ·  Base: https://api.upload-post.com/api
Auth: header  Authorization: Apikey <key>

Every call raises :class:`UploadPostError` on a non-2xx response or an
``{"success": false}`` body, carrying the API's own message.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx

from app.core.config import settings

# our platform id  ->  Upload-Post platform id  (identical today, kept explicit)
PLATFORM_MAP: Dict[str, str] = {
    "facebook": "facebook",
    "instagram": "instagram",
    "x": "x",
    "linkedin": "linkedin",
    "tiktok": "tiktok",
    "youtube": "youtube",
}

# which endpoint each platform can be posted through
TEXT_PLATFORMS = {"linkedin", "x", "facebook"}
PHOTO_PLATFORMS = {"tiktok", "instagram", "linkedin", "facebook", "x"}
VIDEO_PLATFORMS = {"tiktok", "instagram", "linkedin", "youtube", "facebook", "x"}

# platforms the hosted connect page + our OAuth-start flow support
CONNECTABLE_PLATFORMS = ["facebook", "instagram", "x", "linkedin", "tiktok", "youtube"]

_TIMEOUT = httpx.Timeout(120.0, connect=15.0)

FileTuple = Tuple[str, bytes, str]  # (filename, content, content_type)


class UploadPostError(Exception):
    def __init__(self, message: str, status_code: int = 0, payload: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.payload = payload


class UploadPostClient:
    def __init__(self) -> None:
        self.base = settings.UPLOAD_POST_BASE_URL.rstrip("/")
        self.key = settings.UPLOAD_POST_API_KEY

    @property
    def enabled(self) -> bool:
        return bool(self.key)

    def _require(self) -> None:
        if not self.enabled:
            raise UploadPostError(
                "Social publishing is not configured. Add UPLOAD_POST_API_KEY to the backend .env.",
                status_code=503,
            )

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Apikey {self.key}"}

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: Any = None,
        form: Any = None,
        files: Any = None,
    ) -> Dict[str, Any]:
        """`form` = list[(name, value)] text fields; `files` = list[(name, (filename, bytes, ct))].
        Both are sent as multipart/form-data (httpx's AsyncClient rejects list-shaped
        `data=`, and Upload-Post's upload endpoints want multipart anyway)."""
        self._require()
        url = f"{self.base}{path}"
        multipart: Any = None
        if form is not None or files is not None:
            multipart = [(k, (None, str(v))) for (k, v) in (form or [])]
            multipart += list(files or [])
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.request(
                method, url, headers=self._headers(), json=json, params=params, files=multipart
            )
        try:
            body = resp.json()
        except Exception:
            body = {"raw": resp.text}

        if resp.status_code >= 300 or (isinstance(body, dict) and body.get("success") is False):
            msg = ""
            if isinstance(body, dict):
                msg = body.get("message") or body.get("error") or body.get("error_description") or ""
                if not msg and body.get("invalid_platforms"):
                    msg = "; ".join(f"{k}: {v}" for k, v in body["invalid_platforms"].items())
            raise UploadPostError(msg or f"Upload-Post request failed ({resp.status_code})", resp.status_code, body)
        return body if isinstance(body, dict) else {"data": body}

    # ---- account / key ------------------------------------------------
    async def me(self) -> Dict[str, Any]:
        return await self._request("GET", "/uploadposts/me")

    # ---- profiles ---------------------------------------------------
    async def get_profile(self, username: str) -> Optional[Dict[str, Any]]:
        try:
            body = await self._request("GET", f"/uploadposts/users/{username}")
        except UploadPostError as exc:
            if exc.status_code == 404:
                return None
            raise
        return body.get("profile")

    async def create_profile(self, username: str) -> Dict[str, Any]:
        body = await self._request("POST", "/uploadposts/users", json={"username": username})
        return body.get("profile", {})

    async def delete_profile(self, username: str) -> None:
        await self._request("DELETE", "/uploadposts/users", json={"username": username})

    async def generate_connect_url(
        self,
        username: str,
        *,
        redirect_url: str,
        logo_image: Optional[str] = None,
        connect_title: Optional[str] = None,
        connect_description: Optional[str] = None,
        platforms: Optional[Sequence[str]] = None,
        language: str = "en",
    ) -> str:
        payload: Dict[str, Any] = {
            "username": username,
            "redirect_url": redirect_url,
            "language": language,
            "redirect_button_text": "Back to Tolkyn",
        }
        if logo_image:
            payload["logo_image"] = logo_image
        if connect_title:
            payload["connect_title"] = connect_title
        if connect_description:
            payload["connect_description"] = connect_description
        if platforms:
            payload["platforms"] = list(platforms)
        body = await self._request("POST", "/uploadposts/users/generate-jwt", json=payload)
        return body["access_url"]

    async def oauth_start(self, platform: str, profile: str, redirect_url: str) -> Dict[str, Any]:
        return await self._request(
            "POST",
            f"/uploadposts/oauth/{platform}/start",
            json={"profile": profile, "redirect_url": redirect_url},
        )

    # ---- publishing ----------------------------------------------
    @staticmethod
    def _platform_fields(platforms: Sequence[str]) -> List[Tuple[str, str]]:
        return [("platform[]", PLATFORM_MAP.get(p, p)) for p in platforms]

    async def upload_text(
        self,
        user: str,
        platforms: Sequence[str],
        text: str,
        *,
        scheduled_date: Optional[str] = None,
        timezone: Optional[str] = None,
        async_upload: bool = False,
    ) -> Dict[str, Any]:
        form: List[Tuple[str, str]] = [("user", user), ("title", text)]
        form += self._platform_fields(platforms)
        if scheduled_date:
            form.append(("scheduled_date", scheduled_date))
            if timezone:
                form.append(("timezone", timezone))
        if async_upload:
            form.append(("async_upload", "true"))
        return await self._request("POST", "/upload_text", form=form)

    async def upload_photos(
        self,
        user: str,
        platforms: Sequence[str],
        photos: Sequence[FileTuple],
        *,
        caption: str = "",
        scheduled_date: Optional[str] = None,
        timezone: Optional[str] = None,
        async_upload: bool = False,
    ) -> Dict[str, Any]:
        form: List[Tuple[str, str]] = [("user", user)]
        if caption:
            form.append(("title", caption))
        form += self._platform_fields(platforms)
        if scheduled_date:
            form.append(("scheduled_date", scheduled_date))
            if timezone:
                form.append(("timezone", timezone))
        if async_upload:
            form.append(("async_upload", "true"))
        files = [("photos[]", (fn, content, ct)) for (fn, content, ct) in photos]
        return await self._request("POST", "/upload_photos", form=form, files=files)

    async def upload_video(
        self,
        user: str,
        platforms: Sequence[str],
        *,
        video_file: Optional[FileTuple] = None,
        video_url: Optional[str] = None,
        caption: str = "",
        scheduled_date: Optional[str] = None,
        timezone: Optional[str] = None,
        async_upload: bool = True,
    ) -> Dict[str, Any]:
        form: List[Tuple[str, str]] = [("user", user)]
        if caption:
            form.append(("title", caption))
        form += self._platform_fields(platforms)
        if scheduled_date:
            form.append(("scheduled_date", scheduled_date))
            if timezone:
                form.append(("timezone", timezone))
        if async_upload:
            form.append(("async_upload", "true"))
        files = None
        if video_file is not None:
            files = [("video", (video_file[0], video_file[1], video_file[2]))]
        elif video_url:
            form.append(("video", video_url))
        return await self._request("POST", "/upload", form=form, files=files)

    # ---- status / history / schedule -----------------------------
    async def status(self, *, request_id: Optional[str] = None, job_id: Optional[str] = None) -> Dict[str, Any]:
        params = {k: v for k, v in {"request_id": request_id, "job_id": job_id}.items() if v}
        return await self._request("GET", "/uploadposts/status", params=params)

    async def history(self, *, page: int = 1, limit: int = 20) -> Dict[str, Any]:
        limit = min((10, 20, 50, 100), key=lambda v: abs(v - limit))
        return await self._request("GET", "/uploadposts/history", params={"page": page, "limit": limit})

    async def list_scheduled(self) -> Dict[str, Any]:
        return await self._request("GET", "/uploadposts/schedule")

    async def cancel_scheduled(self, job_id: str) -> Dict[str, Any]:
        return await self._request("DELETE", f"/uploadposts/schedule/{job_id}")

    async def edit_scheduled(self, job_id: str, **fields: Any) -> Dict[str, Any]:
        return await self._request("PATCH", f"/uploadposts/schedule/{job_id}", json=fields)

    async def analytics(
        self, profile_username: str, platforms: Sequence[str], *, page_id: Optional[str] = None
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"platforms": ",".join(PLATFORM_MAP.get(p, p) for p in platforms)}
        if page_id:
            params["page_id"] = page_id
        return await self._request("GET", f"/analytics/{profile_username}", params=params)

    async def total_impressions(self, profile_username: str) -> Dict[str, Any]:
        return await self._request("GET", f"/uploadposts/total-impressions/{profile_username}")

    async def post_analytics_cached(
        self, user: str, *, platform: Optional[str] = None, limit: int = 100
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"user": user, "limit": limit}
        if platform:
            params["platform"] = PLATFORM_MAP.get(platform, platform)
        return await self._request("GET", "/uploadposts/post-analytics/cached", params=params)

    async def audience(self, user: str, platform: str = "tiktok") -> Dict[str, Any]:
        return await self._request(
            "GET", "/uploadposts/audience", params={"user": user, "platform": platform}
        )

    # ---- engagement: media + comments + DMs -----------------------
    async def media(self, platform: str, user: str, *, limit: int = 15) -> Dict[str, Any]:
        return await self._request(
            "GET",
            "/uploadposts/media",
            params={"platform": PLATFORM_MAP.get(platform, platform), "user": user, "limit": limit},
        )

    async def comments(
        self, platform: str, user: str, *, post_id: str, limit: int = 30
    ) -> Dict[str, Any]:
        return await self._request(
            "GET",
            "/uploadposts/comments",
            params={
                "platform": PLATFORM_MAP.get(platform, platform),
                "user": user,
                "post_id": post_id,
                "limit": limit,
            },
        )

    async def create_comment(
        self,
        platform: str,
        user: str,
        message: str,
        *,
        post_id: Optional[str] = None,
        comment_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "platform": PLATFORM_MAP.get(platform, platform),
            "user": user,
            "message": message,
        }
        if comment_id:
            body["comment_id"] = comment_id
        if post_id:
            body["post_id"] = post_id
        return await self._request("POST", "/uploadposts/comments/create", json=body)

    async def dm_conversations(self, user: str, platform: str = "instagram") -> Dict[str, Any]:
        return await self._request(
            "GET", "/uploadposts/dms/conversations", params={"platform": platform, "user": user}
        )

    async def dm_send(self, user: str, recipient_id: str, message: str, platform: str = "instagram") -> Dict[str, Any]:
        return await self._request(
            "POST",
            "/uploadposts/dms/send",
            json={"platform": platform, "user": user, "recipient_id": recipient_id, "message": message},
        )

    async def unpublish(self, platform: str, user: str, post_id: str) -> Dict[str, Any]:
        return await self._request(
            "POST",
            "/uploadposts/posts/unpublish",
            json={"platform": PLATFORM_MAP.get(platform, platform), "user": user, "post_id": post_id},
        )


upload_post = UploadPostClient()
