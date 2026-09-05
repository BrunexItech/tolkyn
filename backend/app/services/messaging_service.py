import csv
import io
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.broadcast import Broadcast, BroadcastChannel, BroadcastStatus
from app.models.customer import Customer
from app.models.lead import Lead
from app.services.messaging_provider import (
    normalize_phone,
    send_many,
    sms_ready,
    whatsapp_ready,
)

try:
    import phonenumbers
except ImportError:  # pragma: no cover
    phonenumbers = None


def _country_code_from_phone(phone: str) -> Optional[str]:
    """Most leads/customers never have their `country` field filled in
    manually, but their phone number's own calling code tells us for real —
    e.g. +254... is always Kenya. This is what actually makes 'in my target
    areas' filtering usable on real data instead of empty fields."""
    if not phonenumbers or not phone:
        return None
    try:
        parsed = phonenumbers.parse(phone, None)
        return phonenumbers.region_code_for_number(parsed)
    except Exception:  # noqa: BLE001
        return None

_MAX_RECIPIENTS = 2000
_CSV_MAX_ROWS = 5000

_PHONE_HEADERS = {
    "phone", "phone number", "phonenumber", "mobile", "mobile number", "mobilenumber",
    "number", "msisdn", "tel", "telephone", "cell", "cellphone", "contact", "contact number",
    "whatsapp", "whatsapp number",
}
# Exact-match name headers, plus substrings that mark a column as a name column
# (so "Business Name", "Company", "Client name", "Organisation", "Surname" etc.
# all get picked up).
_NAME_HEADERS = {
    "name", "full name", "fullname", "contact name", "contact person", "customer name",
    "client name", "first name", "firstname", "recipient", "recipient name", "business",
    "business name", "company", "company name", "organisation", "organization", "org",
    "person", "surname", "last name", "lastname", "display name",
}
_NAME_HEADER_HINTS = ("name", "business", "company", "organis", "organiz", "client", "customer", "person", "surname")
_HAS_LETTER = re.compile(r"[A-Za-z]")


def parse_contacts_csv(raw: bytes) -> Dict[str, Any]:
    """Pull {name, phone} out of an uploaded CSV. Tolerant of no header, odd
    delimiters, extra columns and a plain single column of numbers."""
    text = raw.decode("utf-8-sig", errors="replace").strip()
    if not text:
        return {"recipients": [], "imported": 0, "skipped": 0, "columns": []}

    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = [r for r in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in r)]
    if not rows:
        return {"recipients": [], "imported": 0, "skipped": 0, "columns": []}

    header = [c.strip() for c in rows[0]]
    has_header = not any(normalize_phone(c) for c in header) and any(header)
    data_rows = rows[1:] if has_header else rows

    phone_idx: Optional[int] = None
    name_idx: Optional[int] = None
    if has_header:
        low = [h.lower() for h in header]
        for i, h in enumerate(low):
            if phone_idx is None and (h in _PHONE_HEADERS or "phone" in h or "mobile" in h or "msisdn" in h):
                phone_idx = i
            if name_idx is None and (h in _NAME_HEADERS or any(k in h for k in _NAME_HEADER_HINTS)):
                # ...but "contact number" / "phone name" style headers are phones, not names
                if not ("number" in h or "phone" in h or "mobile" in h):
                    name_idx = i
    if phone_idx is None:  # scan columns, pick the one with the most valid phones
        hits: Dict[int, int] = {}
        for r in data_rows[:60]:
            for i, c in enumerate(r):
                if normalize_phone(c):
                    hits[i] = hits.get(i, 0) + 1
        if hits:
            phone_idx = max(hits, key=hits.get)

    # A separate "last name" / "surname" column to fold into the name.
    last_idx: Optional[int] = None
    if has_header and name_idx is not None:
        low = [h.lower() for h in header]
        for i, h in enumerate(low):
            if i != name_idx and ("last name" in h or "lastname" in h or "surname" in h):
                last_idx = i
                break

    # Still no name column identified (no header, or an unrecognised one)? Infer
    # it from the data: the non-phone column with the most "texty" values
    # (letters, not a phone number).
    if name_idx is None and phone_idx is not None:
        text_hits: Dict[int, int] = {}
        for r in data_rows[:60]:
            for i, c in enumerate(r):
                if i == phone_idx:
                    continue
                s = c.strip()
                if s and _HAS_LETTER.search(s) and not normalize_phone(s):
                    text_hits[i] = text_hits.get(i, 0) + 1
        if text_hits:
            name_idx = max(text_hits, key=text_hits.get)

    recipients: List[Dict[str, Any]] = []
    seen: set[str] = set()
    imported = skipped = 0
    for r in data_rows:
        phone = None
        if phone_idx is not None and phone_idx < len(r):
            phone = normalize_phone(r[phone_idx])
        if not phone:  # last resort: any cell that looks like a phone
            phone = next((normalize_phone(c) for c in r if normalize_phone(c)), None)
        if not phone:
            skipped += 1
            continue
        key = re.sub(r"\D", "", phone)
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        name = None
        if name_idx is not None and name_idx < len(r) and r[name_idx].strip():
            name = r[name_idx].strip()
            if last_idx is not None and last_idx < len(r) and r[last_idx].strip():
                name = f"{name} {r[last_idx].strip()}"
            name = name[:160]
        recipients.append({"name": name, "phone": phone, "source": "csv"})
        imported += 1
        if imported >= _CSV_MAX_ROWS:
            break

    return {
        "recipients": recipients,
        "imported": imported,
        "skipped": skipped,
        "columns": header if has_header else [],
    }


class MessagingService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    # ---- address book -------------------------------------------------
    async def contacts(
        self,
        search: str = "",
        *,
        source: str = "all",           # all | lead | customer
        status: Optional[str] = None,  # lead status filter
        score: Optional[str] = None,   # lead score filter
        target_area_ids: Optional[List[str]] = None,  # Geo Targeting scope
        limit: int = 2000,
    ) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        s = (search or "").lower().strip()

        area_country_codes: Optional[set] = None
        if target_area_ids:
            from app.services.geo_service import GeoService

            areas = await GeoService(self.db, self.user_id).list_areas()
            area_country_codes = {
                a.country_code for a in areas if a.id in target_area_ids and a.country_code
            }

        if source in ("all", "lead"):
            q = select(Lead).where(Lead.workspace_id == self.workspace_id)
            if status:
                q = q.where(Lead.status == status)
            if score:
                q = q.where(Lead.score == score)
            for l in (await self.db.execute(q)).scalars().all():
                phone = normalize_phone(l.phone or "")
                if not phone:
                    continue
                rows.append({
                    "name": l.name, "company": l.company, "phone": phone,
                    "country": l.country, "country_code": _country_code_from_phone(phone),
                    "source": "lead", "ref_id": l.id,
                })

        if source in ("all", "customer"):
            for c in (
                await self.db.execute(
                    select(Customer).where(Customer.workspace_id == self.workspace_id)
                )
            ).scalars().all():
                phone = normalize_phone(c.phone or "")
                if not phone:
                    continue
                rows.append({
                    "name": c.name, "company": c.company, "phone": phone,
                    "country": c.country, "country_code": _country_code_from_phone(phone),
                    "source": "customer", "ref_id": c.id,
                })

        # de-dupe by phone, keep first
        seen: set[str] = set()
        uniq: List[Dict[str, Any]] = []
        for r in rows:
            if r["phone"] in seen:
                continue
            seen.add(r["phone"])
            if s and s not in f"{r['name']} {r['company'] or ''} {r['phone']}".lower():
                continue
            if area_country_codes is not None and r.get("country_code") not in area_country_codes:
                continue
            uniq.append(r)
        return uniq[:limit]

    def import_csv(self, raw: bytes) -> Dict[str, Any]:
        return parse_contacts_csv(raw)

    # ---- broadcasts --------------------------------------------------
    async def list(self, channel: str | None = None) -> List[Broadcast]:
        q = select(Broadcast).where(Broadcast.workspace_id == self.workspace_id)
        if channel:
            q = q.where(Broadcast.channel == BroadcastChannel(channel))
        res = await self.db.execute(q.order_by(Broadcast.created_at.desc()))
        return list(res.scalars().all())

    async def get(self, bid: str) -> Broadcast:
        res = await self.db.execute(
            select(Broadcast).where(Broadcast.id == bid, Broadcast.workspace_id == self.workspace_id)
        )
        b = res.scalar_one_or_none()
        if not b:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Broadcast not found")
        return b

    def _clean_recipients(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for r in raw or []:
            phone = normalize_phone(str(r.get("phone", "")))
            if not phone or phone in seen:
                continue
            seen.add(phone)
            out.append({
                "name": (r.get("name") or "").strip() or None,
                "phone": phone,
                "source": r.get("source") or "manual",
            })
        if len(out) > _MAX_RECIPIENTS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Too many recipients (max {_MAX_RECIPIENTS})")
        return out

    async def create(self, data: Dict[str, Any]) -> Broadcast:
        recipients = self._clean_recipients(data.get("recipients", []))
        b = Broadcast(
            channel=BroadcastChannel(data.get("channel", "sms")),
            status=BroadcastStatus.DRAFT,
            name=data["name"],
            body=data.get("body", ""),
            recipients=recipients,
            total=len(recipients),
            scheduled_at=data.get("scheduled_at"),
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
            simulated=1,
        )
        self.db.add(b)
        await self.db.commit()
        await self.db.refresh(b)
        return b

    async def update(self, bid: str, patch: Dict[str, Any]) -> Broadcast:
        b = await self.get(bid)
        if b.status in (BroadcastStatus.SENDING, BroadcastStatus.SENT):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Broadcast already sent")
        if "name" in patch:
            b.name = patch["name"]
        if "body" in patch:
            b.body = patch["body"]
        if patch.get("channel"):
            b.channel = BroadcastChannel(patch["channel"])
        if "scheduled_at" in patch:
            b.scheduled_at = patch["scheduled_at"]
        if "recipients" in patch and patch["recipients"] is not None:
            b.recipients = self._clean_recipients(patch["recipients"])
            b.total = len(b.recipients)
        b.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(b)
        return b

    async def delete(self, bid: str) -> None:
        b = await self.get(bid)
        await self.db.delete(b)
        await self.db.commit()

    async def send(self, bid: str) -> Broadcast:
        b = await self.get(bid)
        if b.status in (BroadcastStatus.SENDING, BroadcastStatus.SENT):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Broadcast already sent")
        if not b.recipients:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add at least one recipient")
        if not (b.body or "").strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Message body is empty")

        b.status = BroadcastStatus.SENDING
        await self.db.commit()

        phones = [r["phone"] for r in b.recipients]
        results = await send_many(b.channel.value, phones, b.body, workspace_id=self.workspace_id)

        rows = [
            {"phone": r.phone, "ok": r.ok, "id": r.id, "error": r.error, "simulated": r.simulated}
            for r in results
        ]
        sent = sum(1 for r in results if r.ok)
        failed = len(results) - sent

        b.results = rows
        b.sent_count = sent
        b.failed_count = failed
        b.simulated = 1 if results and all(r.simulated for r in results) else 0
        # never expose the underlying vendor to the UI — just "live" or "simulated"
        b.provider = "simulated" if b.simulated else "live"
        b.sent_at = datetime.now(timezone.utc)
        if failed == 0:
            b.status = BroadcastStatus.SENT
        elif sent == 0:
            b.status = BroadcastStatus.FAILED
        else:
            b.status = BroadcastStatus.PARTIAL
        await self.db.commit()
        await self.db.refresh(b)
        return b

    async def summary(self) -> Dict[str, Any]:
        items = await self.list()
        sms = [b for b in items if b.channel == BroadcastChannel.SMS]
        wa = [b for b in items if b.channel == BroadcastChannel.WHATSAPP]
        return {
            "sms_broadcasts": len(sms),
            "whatsapp_broadcasts": len(wa),
            "messages_sent": sum(b.sent_count for b in items),
            "messages_failed": sum(b.failed_count for b in items),
            "sms_provider": "live" if sms_ready() else "simulated",
            "whatsapp_provider": "live" if whatsapp_ready() else "simulated",
        }
