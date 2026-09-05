import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.models.upload import Upload
from app.schemas.upload import UploadList, UploadResponse

router = APIRouter()

_DIR = Path(__file__).resolve().parents[4] / "media" / "uploads"
_DIR.mkdir(parents=True, exist_ok=True)
_MAX = 100 * 1024 * 1024  # 100 MB

_KIND = {
    "image": ("image/",),
    "video": ("video/",),
    "audio": ("audio/",),
}
_EXT_KIND = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".bmp"},
    "video": {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"},
    "audio": {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"},
}


def _kind_for(content_type: str, filename: str = "") -> str:
    ct = content_type or ""
    for k, prefixes in _KIND.items():
        if any(ct.startswith(p) for p in prefixes):
            return k
    ext = Path(filename or "").suffix.lower()
    for k, exts in _EXT_KIND.items():
        if ext in exts:
            return k
    return "file"


@router.post("", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    if len(data) > _MAX:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 100 MB")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")

    ext = Path(file.filename or "").suffix.lower()[:8] or ""
    fid = uuid.uuid4().hex
    (_DIR / f"{fid}{ext}").write_bytes(data)

    row = Upload(
        kind=_kind_for(file.content_type or "", file.filename or ""),
        url=f"/media/uploads/{fid}{ext}",
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=len(data),
        owner_id=user_id,
        workspace_id=user_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return UploadResponse.model_validate(row)


@router.get("", response_model=UploadList)
async def list_uploads(
    kind: str | None = None,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    q = select(Upload).where(Upload.workspace_id == user_id)
    if kind:
        q = q.where(Upload.kind == kind)
    rows = (await db.execute(q.order_by(Upload.created_at.desc()).limit(60))).scalars().all()
    return UploadList(items=[UploadResponse.model_validate(r) for r in rows])


@router.delete("/{upload_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    upload_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(Upload).where(Upload.id == upload_id, Upload.workspace_id == user_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found")
    await db.delete(row)
    await db.commit()
