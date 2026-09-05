from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt, encrypt
from app.models.email_account import EmailAccount
from app.schemas.email_account import EmailAccountCreate, EmailAccountResponse, EmailAccountUpdate
from app.services.email_sender import SmtpConfig, send_email, verify_smtp


class EmailAccountService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    # -------------------------------------------------------------- helpers
    async def _get(self, account_id: str) -> EmailAccount:
        res = await self.db.execute(
            select(EmailAccount).where(
                EmailAccount.id == account_id,
                EmailAccount.workspace_id == self.workspace_id,
            )
        )
        acc = res.scalar_one_or_none()
        if not acc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Email account not found")
        return acc

    def _to_response(self, acc: EmailAccount) -> EmailAccountResponse:
        return EmailAccountResponse(
            id=acc.id,
            label=acc.label,
            type=acc.type,
            from_name=acc.from_name,
            from_email=acc.from_email,
            reply_to=acc.reply_to,
            smtp_host=acc.smtp_host,
            smtp_port=acc.smtp_port,
            smtp_username=acc.smtp_username,
            use_tls=acc.use_tls,
            use_ssl=acc.use_ssl,
            signature=acc.signature,
            is_default=acc.is_default,
            has_password=bool(acc.smtp_password_enc),
            verified_at=acc.verified_at,
            last_used_at=acc.last_used_at,
            last_error=acc.last_error,
            daily_limit=acc.daily_limit,
            sent_today=self._sent_today(acc),
            sent_total=acc.sent_total,
            workspace_id=acc.workspace_id,
            created_at=acc.created_at,
            updated_at=acc.updated_at,
        )

    @staticmethod
    def _sent_today(acc: EmailAccount) -> int:
        today = date.today().isoformat()
        return acc.sent_today if acc.sent_today_date == today else 0

    def smtp_config(self, acc: EmailAccount) -> SmtpConfig:
        return SmtpConfig(
            host=acc.smtp_host or "",
            port=acc.smtp_port or 587,
            username=acc.smtp_username or acc.from_email,
            password=decrypt(acc.smtp_password_enc or ""),
            use_tls=acc.use_tls,
            use_ssl=acc.use_ssl,
            from_name=acc.from_name,
            from_email=acc.from_email,
            reply_to=acc.reply_to,
        )

    # ----------------------------------------------------------------- CRUD
    async def list(self) -> List[EmailAccountResponse]:
        res = await self.db.execute(
            select(EmailAccount)
            .where(EmailAccount.workspace_id == self.workspace_id)
            .order_by(EmailAccount.is_default.desc(), EmailAccount.created_at.desc())
        )
        return [self._to_response(a) for a in res.scalars().all()]

    async def get(self, account_id: str) -> EmailAccountResponse:
        return self._to_response(await self._get(account_id))

    async def create(self, data: EmailAccountCreate) -> EmailAccountResponse:
        acc = EmailAccount(
            label=data.label,
            type=data.type,
            from_name=data.from_name,
            from_email=str(data.from_email),
            reply_to=str(data.reply_to) if data.reply_to else None,
            smtp_host=data.smtp_host,
            smtp_port=data.smtp_port,
            smtp_username=data.smtp_username or str(data.from_email),
            smtp_password_enc=encrypt(data.smtp_password) if data.smtp_password else None,
            use_tls=data.use_tls,
            use_ssl=data.use_ssl,
            signature=data.signature,
            daily_limit=data.daily_limit,
            is_default=data.is_default,
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(acc)
        await self.db.flush()
        if data.is_default:
            await self._clear_other_defaults(acc.id)
        else:
            # first account becomes default automatically
            existing = await self.db.execute(
                select(EmailAccount.id).where(EmailAccount.workspace_id == self.workspace_id)
            )
            if len(existing.scalars().all()) == 1:
                acc.is_default = True
        await self.db.commit()
        await self.db.refresh(acc)
        return self._to_response(acc)

    async def update(self, account_id: str, data: EmailAccountUpdate) -> EmailAccountResponse:
        acc = await self._get(account_id)
        patch = data.model_dump(exclude_unset=True)
        pw = patch.pop("smtp_password", None)
        make_default = patch.pop("is_default", None)
        for k, v in patch.items():
            if k in ("from_email", "reply_to") and v is not None:
                v = str(v)
            setattr(acc, k, v)
        if pw:
            acc.smtp_password_enc = encrypt(pw)
            acc.verified_at = None
        if make_default:
            acc.is_default = True
            await self._clear_other_defaults(acc.id)
        acc.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(acc)
        return self._to_response(acc)

    async def delete(self, account_id: str) -> None:
        acc = await self._get(account_id)
        was_default = acc.is_default
        await self.db.delete(acc)
        await self.db.commit()
        if was_default:
            res = await self.db.execute(
                select(EmailAccount)
                .where(EmailAccount.workspace_id == self.workspace_id)
                .order_by(EmailAccount.created_at)
                .limit(1)
            )
            nxt = res.scalar_one_or_none()
            if nxt:
                nxt.is_default = True
                await self.db.commit()

    async def _clear_other_defaults(self, keep_id: str) -> None:
        await self.db.execute(
            update(EmailAccount)
            .where(
                EmailAccount.workspace_id == self.workspace_id,
                EmailAccount.id != keep_id,
            )
            .values(is_default=False)
        )

    # ---------------------------------------------------------------- verify
    async def test(self, account_id: str, to_email: Optional[str]) -> tuple[bool, str]:
        acc = await self._get(account_id)
        cfg = self.smtp_config(acc)
        if not cfg.host or not cfg.password:
            return False, "SMTP host and password are required."

        if to_email:
            outcome = await send_email(
                cfg,
                to_email,
                "Tolkyn test email",
                f"This is a test from your '{acc.label}' sending account.\n\n"
                "If you received this, sending is configured correctly.",
            )
        else:
            outcome = await verify_smtp(cfg)

        acc.verified_at = datetime.now(timezone.utc) if outcome.ok else None
        acc.last_error = None if outcome.ok else outcome.error
        await self.db.commit()
        return outcome.ok, ("Verified. Sending works." if outcome.ok else (outcome.error or "Failed."))

    # ------------------------------------------------------- send accounting
    async def can_send(self, acc: EmailAccount) -> bool:
        return self._sent_today(acc) < acc.daily_limit

    async def record_send(self, acc: EmailAccount, ok: bool, error: Optional[str] = None) -> None:
        today = date.today().isoformat()
        if acc.sent_today_date != today:
            acc.sent_today_date = today
            acc.sent_today = 0
        if ok:
            acc.sent_today += 1
            acc.sent_total += 1
            acc.last_used_at = datetime.now(timezone.utc)
            acc.last_error = None
        else:
            acc.last_error = error
        await self.db.commit()

    async def default_account(self) -> Optional[EmailAccount]:
        res = await self.db.execute(
            select(EmailAccount)
            .where(EmailAccount.workspace_id == self.workspace_id, EmailAccount.is_default.is_(True))
            .limit(1)
        )
        return res.scalar_one_or_none()

    async def get_model(self, account_id: str) -> EmailAccount:
        return await self._get(account_id)
