"""Downloadable PDF metrics report -- social/content + messaging (SMS,
WhatsApp, Email) for a date range. One workspace's own data, or the whole
platform when called with workspace_id=None (Super Admin only -- gated at
the endpoint, not here).

Pure-Python PDF rendering (xhtml2pdf, HTML/CSS -> PDF) so this drops into
the existing slim backend image with no system-level deps (unlike
weasyprint, which needs cairo/pango via apt)."""
import html as _html
import io
from collections import Counter
from datetime import date, datetime, time, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from xhtml2pdf import pisa

from app.models.broadcast import Broadcast, BroadcastChannel
from app.models.email_campaign import EmailCampaign
from app.models.post import Post, PostStatus
from app.models.user import User

_ACCENT = "#4f7cff"
_TEXT = "#171a21"
_MUTED = "#6b7280"
_BORDER = "#e2e5ea"
_BG_SOFT = "#f6f7fb"


def _day_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return (
        datetime.combine(start, time.min, tzinfo=timezone.utc),
        datetime.combine(end, time.max, tzinfo=timezone.utc),
    )


async def _workspace_label(db: AsyncSession, workspace_id: Optional[str]) -> str:
    if not workspace_id:
        return "All workspaces (platform-wide)"
    row = (
        await db.execute(select(User.name, User.email).where(User.id == workspace_id))
    ).first()
    if not row:
        return workspace_id
    return f"{row.name} ({row.email})"


async def _post_metrics(db: AsyncSession, workspace_id: Optional[str], start_dt: datetime, end_dt: datetime) -> dict:
    q = select(Post).where(Post.created_at >= start_dt, Post.created_at <= end_dt)
    if workspace_id:
        q = q.where(Post.workspace_id == workspace_id)
    posts = (await db.execute(q)).scalars().all()

    by_status = Counter(p.status.value for p in posts)
    platform_counts: Counter = Counter()
    for p in posts:
        for plat in (p.platforms or []):
            platform_counts[plat] += 1

    return {
        "total": len(posts),
        "published": by_status.get(PostStatus.PUBLISHED.value, 0),
        "scheduled": by_status.get(PostStatus.SCHEDULED.value, 0),
        "failed": by_status.get(PostStatus.FAILED.value, 0) + by_status.get(PostStatus.PARTIAL.value, 0),
        "by_platform": sorted(platform_counts.items(), key=lambda x: -x[1]),
    }


async def _broadcast_metrics(
    db: AsyncSession, workspace_id: Optional[str], start_dt: datetime, end_dt: datetime, channel: BroadcastChannel
) -> dict:
    q = select(Broadcast).where(
        Broadcast.created_at >= start_dt, Broadcast.created_at <= end_dt, Broadcast.channel == channel
    )
    if workspace_id:
        q = q.where(Broadcast.workspace_id == workspace_id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "campaigns": len(rows),
        "total": sum(r.total for r in rows),
        "sent": sum(r.sent_count for r in rows),
        "failed": sum(r.failed_count for r in rows),
    }


async def _email_metrics(db: AsyncSession, workspace_id: Optional[str], start_dt: datetime, end_dt: datetime) -> dict:
    q = select(EmailCampaign).where(EmailCampaign.created_at >= start_dt, EmailCampaign.created_at <= end_dt)
    if workspace_id:
        q = q.where(EmailCampaign.workspace_id == workspace_id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "campaigns": len(rows),
        "total": sum(r.total for r in rows),
        "sent": sum(r.sent for r in rows),
        "failed": sum(r.failed for r in rows),
        "skipped": sum(r.skipped for r in rows),
    }


def _stat_card(label: str, value: object) -> str:
    return (
        f'<td style="padding:10px 14px;border:1px solid {_BORDER};border-radius:6px;'
        f'background:{_BG_SOFT};width:25%">'
        f'<div style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:{_MUTED}">'
        f"{_html.escape(label)}</div>"
        f'<div style="font-size:20px;font-weight:700;color:{_TEXT};margin-top:2px">{value}</div>'
        f"</td>"
    )


def _section(title: str, cards_html: str, table_html: str = "") -> str:
    return (
        f'<h2 style="font-size:14px;color:{_TEXT};border-bottom:2px solid {_ACCENT};'
        f'padding-bottom:6px;margin:26px 0 10px">{_html.escape(title)}</h2>'
        f'<table style="width:100%;border-collapse:separate;border-spacing:8px 0"><tr>{cards_html}</tr></table>'
        f"{table_html}"
    )


async def build_metrics_report_pdf(
    db: AsyncSession, workspace_id: Optional[str], start: date, end: date
) -> bytes:
    start_dt, end_dt = _day_bounds(start, end)
    label = await _workspace_label(db, workspace_id)

    posts = await _post_metrics(db, workspace_id, start_dt, end_dt)
    sms = await _broadcast_metrics(db, workspace_id, start_dt, end_dt, BroadcastChannel.SMS)
    wa = await _broadcast_metrics(db, workspace_id, start_dt, end_dt, BroadcastChannel.WHATSAPP)
    email = await _email_metrics(db, workspace_id, start_dt, end_dt)

    platform_rows = "".join(
        f'<tr><td style="padding:4px 8px;border-bottom:1px solid {_BORDER}">{_html.escape(p)}</td>'
        f'<td style="padding:4px 8px;border-bottom:1px solid {_BORDER};text-align:right">{c}</td></tr>'
        for p, c in posts["by_platform"]
    ) or f'<tr><td style="padding:4px 8px;color:{_MUTED}">No posts in this period</td></tr>'

    body = f"""
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="font-family:Helvetica,Arial,sans-serif;color:{_TEXT};font-size:11px">
      <div style="border-bottom:3px solid {_ACCENT};padding-bottom:12px;margin-bottom:10px">
        <div style="font-size:20px;font-weight:700;color:{_ACCENT}">Tolkyn</div>
        <div style="font-size:13px;margin-top:2px">Metrics report</div>
        <div style="font-size:10px;color:{_MUTED};margin-top:4px">
          {_html.escape(label)}<br/>
          {start.isoformat()} &mdash; {end.isoformat()}<br/>
          Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}
        </div>
      </div>

      {_section("Social & content", (
          _stat_card("Posts", posts["total"])
          + _stat_card("Published", posts["published"])
          + _stat_card("Scheduled", posts["scheduled"])
          + _stat_card("Failed / partial", posts["failed"])
      ), f'''
      <table style="width:100%;border-collapse:collapse;margin-top:10px">
        <tr><td style="padding:4px 8px;font-size:9px;text-transform:uppercase;color:{_MUTED}">Platform</td>
            <td style="padding:4px 8px;font-size:9px;text-transform:uppercase;color:{_MUTED};text-align:right">Posts</td></tr>
        {platform_rows}
      </table>''')}

      {_section("Bulk SMS", (
          _stat_card("Campaigns", sms["campaigns"])
          + _stat_card("Recipients", sms["total"])
          + _stat_card("Sent", sms["sent"])
          + _stat_card("Failed", sms["failed"])
      ))}

      {_section("WhatsApp", (
          _stat_card("Campaigns", wa["campaigns"])
          + _stat_card("Recipients", wa["total"])
          + _stat_card("Sent", wa["sent"])
          + _stat_card("Failed", wa["failed"])
      ))}

      {_section("Bulk Email", (
          _stat_card("Campaigns", email["campaigns"])
          + _stat_card("Recipients", email["total"])
          + _stat_card("Sent", email["sent"])
          + _stat_card("Failed / skipped", email["failed"] + email["skipped"])
      ))}

      <div style="margin-top:30px;padding-top:10px;border-top:1px solid {_BORDER};font-size:9px;color:{_MUTED}">
        Tolkyn &middot; tolkyn.co.ke
      </div>
    </body>
    </html>
    """

    buf = io.BytesIO()
    pisa.CreatePDF(body, dest=buf)
    return buf.getvalue()
