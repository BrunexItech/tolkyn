from typing import List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_asset import AssetKind, GeneratedAsset


class StudioService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    async def save(
        self,
        kind: AssetKind,
        prompt: str,
        *,
        platform: str | None = None,
        title: str | None = None,
        payload: dict | None = None,
        image_url: str | None = None,
    ) -> GeneratedAsset:
        asset = GeneratedAsset(
            kind=kind,
            prompt=prompt,
            platform=platform,
            title=title,
            payload=payload,
            image_url=image_url,
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)
        return asset

    async def list(self, kind: str | None = None, limit: int = 40) -> List[GeneratedAsset]:
        q = select(GeneratedAsset).where(GeneratedAsset.workspace_id == self.workspace_id)
        if kind:
            q = q.where(GeneratedAsset.kind == kind)
        q = q.order_by(GeneratedAsset.created_at.desc()).limit(limit)
        return list((await self.db.execute(q)).scalars().all())

    async def delete(self, asset_id: str) -> None:
        res = await self.db.execute(
            select(GeneratedAsset).where(
                GeneratedAsset.id == asset_id,
                GeneratedAsset.workspace_id == self.workspace_id,
            )
        )
        asset = res.scalar_one_or_none()
        if not asset:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
        await self.db.delete(asset)
        await self.db.commit()
