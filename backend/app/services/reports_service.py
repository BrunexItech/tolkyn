"""Downloadable / emailable PDF metrics report -- social/content + messaging
(SMS, WhatsApp, Email) for a date range, with period-over-period change and
AI-written takeaways/recommendations. One workspace's own data, or the
whole platform when called with workspace_id=None (Super Admin only --
gated at the endpoint, not here).

Pure-Python PDF rendering (xhtml2pdf, HTML/CSS -> PDF) so this drops into
the existing slim backend image with no system-level deps (unlike
weasyprint, which needs cairo/pango via apt).

AI insights discipline: the model is handed only the real numbers computed
below and is explicitly told never to invent a number, percentage or trend
that isn't directly in that data -- if a section's previous-period figure
isn't computable (reach/engagement, see note below), it's told that
plainly rather than left to guess at a comparison."""
import html as _html
import io
import json
import logging
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from xhtml2pdf import pisa

from app.models.broadcast import Broadcast, BroadcastChannel
from app.models.email_campaign import EmailCampaign
from app.models.post import Post, PostStatus
from app.models.user import User
from app.services.ai_client import ai

logger = logging.getLogger(__name__)

_ACCENT = "#4f7cff"
_ACCENT_SOFT = "#eaf0ff"
_TEXT = "#171a21"
_MUTED = "#6b7280"
_BORDER = "#e2e5ea"
_BG_SOFT = "#f6f7fb"
_GREEN = "#15803d"
_RED = "#b91c1c"


# ---------------------------------------------------------------- windows
def _day_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return (
        datetime.combine(start, time.min, tzinfo=timezone.utc),
        datetime.combine(end, time.max, tzinfo=timezone.utc),
    )


def _previous_window(start: date, end: date) -> tuple[date, date]:
    """Same length, immediately before -- the only honest baseline for a
    '+X%' claim without picking an arbitrary comparison period."""
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)
    return prev_start, prev_end


def _pct_change(cur: float, prev: float) -> Optional[float]:
    if prev == 0:
        return None if cur == 0 else 100.0
    return round((cur - prev) / prev * 100, 1)


# ---------------------------------------------------------------- queries
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


async def _period_metrics(db: AsyncSession, workspace_id: Optional[str], start: date, end: date) -> dict:
    start_dt, end_dt = _day_bounds(start, end)
    return {
        "posts": await _post_metrics(db, workspace_id, start_dt, end_dt),
        "sms": await _broadcast_metrics(db, workspace_id, start_dt, end_dt, BroadcastChannel.SMS),
        "whatsapp": await _broadcast_metrics(db, workspace_id, start_dt, end_dt, BroadcastChannel.WHATSAPP),
        "email": await _email_metrics(db, workspace_id, start_dt, end_dt),
    }


# ---------------------------------------------------------------- HTML bits
def _delta_html(cur: float, prev: float) -> str:
    pct = _pct_change(cur, prev)
    if pct is None:
        return f'<span style="font-size:9px;color:{_MUTED}">no prior activity</span>'
    color = _GREEN if pct > 0 else (_RED if pct < 0 else _MUTED)
    arrow = "▲" if pct > 0 else ("▼" if pct < 0 else "—")
    return f'<span style="font-size:9px;color:{color};font-weight:600">{arrow} {abs(pct):g}% vs prior period</span>'


def _stat_card(
    label: str, value: object, cur: Optional[float] = None, prev: Optional[float] = None, width: str = "25%"
) -> str:
    delta = _delta_html(cur, prev) if cur is not None and prev is not None else ""
    return (
        f'<td style="padding:10px 14px;border:1px solid {_BORDER};border-radius:6px;'
        f'background:{_BG_SOFT};width:{width}">'
        f'<div style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:{_MUTED}">'
        f"{_html.escape(label)}</div>"
        f'<div style="font-size:20px;font-weight:700;color:{_TEXT};margin-top:2px">{value}</div>'
        f'<div style="margin-top:2px">{delta}</div>'
        f"</td>"
    )


def _section(title: str, cards_html: str, extra_html: str = "") -> str:
    return (
        f'<h2 style="font-size:14px;color:{_TEXT};border-bottom:2px solid {_ACCENT};'
        f'padding-bottom:6px;margin:26px 0 10px">{_html.escape(title)}</h2>'
        f'<table style="width:100%;border-collapse:separate;border-spacing:8px 0"><tr>{cards_html}</tr></table>'
        f"{extra_html}"
    )


def _bar_chart(rows: list[tuple[str, float]], *, color: str = _ACCENT, unit: str = "") -> str:
    """Simple, reliable CSS div-based horizontal bar chart -- xhtml2pdf's
    rendering support is limited, so this sticks to basic block-level
    widths/backgrounds rather than SVG or a JS charting library, which is
    where that engine tends to silently fail or render wrong."""
    if not rows:
        return f'<p style="color:{_MUTED};font-size:10px">No data in this period</p>'
    peak = max((v for _, v in rows), default=0) or 1
    bars = ""
    for label, value in rows:
        pct = max(2, round(value / peak * 100))
        bars += f"""
        <div style="margin-bottom:7px">
          <div style="display:flex;justify-content:space-between;font-size:9.5px;color:{_TEXT};margin-bottom:2px">
            <span>{_html.escape(str(label))}</span>
            <span style="font-weight:600">{value:,.0f}{unit}</span>
          </div>
          <div style="background:{_BORDER};border-radius:4px;height:9px;width:100%">
            <div style="background:{color};border-radius:4px;height:9px;width:{pct}%"></div>
          </div>
        </div>"""
    return bars


def _insights_card(title: str, items: list[str], *, accent: str = _ACCENT, bg: str = _ACCENT_SOFT) -> str:
    if not items:
        return ""
    lis = "".join(
        f'<li style="margin-bottom:6px;line-height:1.5">{_html.escape(it)}</li>' for it in items
    )
    return f"""
    <div style="background:{bg};border-left:4px solid {accent};border-radius:6px;padding:12px 16px;margin-top:10px">
      <div style="font-size:11px;font-weight:700;color:{_TEXT};margin-bottom:6px">{_html.escape(title)}</div>
      <ul style="margin:0;padding-left:16px;font-size:10.5px;color:{_TEXT}">{lis}</ul>
    </div>
    """


def _reach_section(reach_engagement: Optional[dict]) -> str:
    if reach_engagement is None:
        return f"""
        <h2 style="font-size:14px;color:{_TEXT};border-bottom:2px solid {_ACCENT};
                   padding-bottom:6px;margin:26px 0 10px">Reach &amp; engagement</h2>
        <p style="color:{_MUTED}">Per-channel (tied to that workspace's own connected accounts) &mdash;
        see that workspace's own report for this section.</p>
        """
    provider = reach_engagement.get("provider", "modelled")
    rows = reach_engagement.get("platforms") or []
    note = (
        "Live data from each connected platform's own analytics API."
        if provider == "live"
        else "Modelled estimate &mdash; connect accounts via Upload-Post for live platform analytics."
    )
    chart = _bar_chart([(r.get("platform", ""), r.get("reach", 0)) for r in rows], color="#22c55e")
    body_rows = "".join(
        f'<tr>'
        f'<td style="padding:5px 8px;border-bottom:1px solid {_BORDER}">{_html.escape(str(r.get("platform", "")))}</td>'
        f'<td style="padding:5px 8px;border-bottom:1px solid {_BORDER};text-align:right">{r.get("followers", 0):,}</td>'
        f'<td style="padding:5px 8px;border-bottom:1px solid {_BORDER};text-align:right">{r.get("reach", 0):,}</td>'
        f'<td style="padding:5px 8px;border-bottom:1px solid {_BORDER};text-align:right">{r.get("engagement_rate", 0)}%</td>'
        f'<td style="padding:5px 8px;border-bottom:1px solid {_BORDER};text-align:right">{r.get("posts", 0)}</td>'
        f'<td style="padding:5px 8px;border-bottom:1px solid {_BORDER};text-align:right">{_html.escape(str(r.get("best_time", "—")))}</td>'
        f"</tr>"
        for r in rows
    ) or f'<tr><td style="padding:5px 8px;color:{_MUTED}">No connected accounts</td></tr>'
    head = "".join(
        f'<td style="padding:4px 8px;font-size:9px;text-transform:uppercase;color:{_MUTED};{"text-align:right" if h != "Platform" else ""}">{h}</td>'
        for h in ["Platform", "Followers", "Reach", "Engagement rate", "Posts", "Best time to post"]
    )
    return f"""
    <h2 style="font-size:14px;color:{_TEXT};border-bottom:2px solid {_ACCENT};
               padding-bottom:6px;margin:26px 0 10px">Reach &amp; engagement</h2>
    <p style="color:{_MUTED};font-size:10px;margin:0 0 10px">{note} Reach shown is for this period only
    &mdash; a prior-period comparison isn't available for this section (see note at the end of this report).</p>
    <div style="margin-bottom:10px">{chart}</div>
    <table style="width:100%;border-collapse:collapse"><tr>{head}</tr>{body_rows}</table>
    """


# ---------------------------------------------------------------- AI insights
async def _ai_insights(
    label: str, start: date, end: date, prev_start: date, prev_end: date, current: dict, previous: dict
) -> dict:
    """Takeaways + recommendations, grounded strictly in the real numbers
    passed in. No reach/engagement history is included (not computable --
    see _reach_section's note), so the model is told not to comment on a
    reach trend, only reach's absolute current-period figures if present."""
    client = ai()
    if not client.available:
        return {"takeaways": [], "recommendations": []}

    system = (
        "You are writing a short, calm summary of real activity numbers for one business's own "
        "social and messaging channels. You will be given REAL computed metrics for a current date "
        "range and the immediately preceding period of the same length. "
        "RULES: only state numbers, percentages, platform names, and facts directly present in or "
        "computable from the JSON data given to you. Never invent, estimate, or guess a number, "
        "trend, or claim that isn't in that data. This is a plain summary, not a diagnostic report -- "
        "never suggest investigating, troubleshooting, or checking a connection/configuration issue, "
        "even if a channel shows zero activity; just state the fact plainly if at all. Keep it tight: "
        "at most 3 takeaways and 2 recommendations, each one short sentence, no padding or filler. "
        "Return ONLY JSON."
    )
    user = (
        f"Business: {label}\n"
        f"Current period: {start.isoformat()} to {end.isoformat()}\n"
        f"Previous period (same length, immediately before): "
        f"{prev_start.isoformat()} to {prev_end.isoformat()}\n\n"
        f"CURRENT PERIOD:\n{json.dumps(current, indent=2, default=str)}\n\n"
        f"PREVIOUS PERIOD:\n{json.dumps(previous, indent=2, default=str)}\n\n"
        'Return JSON: "takeaways" (at most 3 short sentences summarising these exact numbers), '
        '"recommendations" (at most 2 short, concrete next steps based only on patterns actually '
        "visible in this data)."
    )
    try:
        data = await client.json(system, user, temperature=0.2, max_tokens=500)
    except Exception as exc:  # noqa: BLE001 -- the numeric sections of the report are never blocked by this
        logger.warning("report AI insights failed: %s", exc)
        return {"takeaways": [], "recommendations": []}

    return {
        "takeaways": [str(t) for t in (data.get("takeaways") or [])][:3],
        "recommendations": [str(r) for r in (data.get("recommendations") or [])][:2],
    }


# ---------------------------------------------------------------- build
async def build_metrics_report_pdf(
    db: AsyncSession,
    workspace_id: Optional[str],
    start: date,
    end: date,
    reach_engagement: Optional[dict] = None,
) -> bytes:
    """`reach_engagement`: {"provider": "live"|"modelled", "platforms": [...]},
    from AnalyticsService.overview()/by_platform() -- per-workspace only
    (tied to that workspace's own connected accounts), so the platform-wide
    Super Admin report is built without it."""
    label = await _workspace_label(db, workspace_id)
    prev_start, prev_end = _previous_window(start, end)

    current = await _period_metrics(db, workspace_id, start, end)
    previous = await _period_metrics(db, workspace_id, prev_start, prev_end)
    insights = await _ai_insights(label, start, end, prev_start, prev_end, current, previous)

    posts, posts_prev = current["posts"], previous["posts"]
    sms, sms_prev = current["sms"], previous["sms"]
    wa, wa_prev = current["whatsapp"], previous["whatsapp"]
    email, email_prev = current["email"], previous["email"]

    platform_rows = "".join(
        f'<tr><td style="padding:4px 8px;border-bottom:1px solid {_BORDER}">{_html.escape(p)}</td>'
        f'<td style="padding:4px 8px;border-bottom:1px solid {_BORDER};text-align:right">{c}</td></tr>'
        for p, c in posts["by_platform"]
    ) or f'<tr><td style="padding:4px 8px;color:{_MUTED}">No posts in this period</td></tr>'

    send_volume_chart = _bar_chart(
        [("SMS", sms["sent"]), ("WhatsApp", wa["sent"]), ("Email", email["sent"])], color="#f59e0b"
    )

    body = f"""
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="font-family:Helvetica,Arial,sans-serif;color:{_TEXT};font-size:11px">
      <div style="background:{_ACCENT};padding:18px 20px;border-radius:8px;margin-bottom:14px">
        <div style="font-size:22px;font-weight:700;color:#ffffff">Tolkyn</div>
        <div style="font-size:14px;color:#ffffff;margin-top:2px">Performance report</div>
        <div style="font-size:10px;color:#eef2ff;margin-top:6px">
          {_html.escape(label)}<br/>
          {start.isoformat()} &mdash; {end.isoformat()}
          (vs. {prev_start.isoformat()} &mdash; {prev_end.isoformat()})<br/>
          Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}
        </div>
      </div>

      {_section("Social & content", (
          _stat_card("Posts published", posts["published"], posts["published"], posts_prev["published"], width="50%")
          + _stat_card("Failed / partial", posts["failed"], posts["failed"], posts_prev["failed"], width="50%")
      ), f'''
      <table style="width:100%;border-collapse:collapse;margin-top:10px">
        <tr><td style="padding:4px 8px;font-size:9px;text-transform:uppercase;color:{_MUTED}">Platform</td>
            <td style="padding:4px 8px;font-size:9px;text-transform:uppercase;color:{_MUTED};text-align:right">Posts</td></tr>
        {platform_rows}
      </table>''')}

      {_reach_section(reach_engagement)}

      <h2 style="font-size:14px;color:{_TEXT};border-bottom:2px solid {_ACCENT};
                 padding-bottom:6px;margin:26px 0 10px">Messaging send volume</h2>
      <div style="margin-bottom:6px">{send_volume_chart}</div>

      {_section("Bulk SMS", (
          _stat_card("Campaigns", sms["campaigns"])
          + _stat_card("Recipients", sms["total"])
          + _stat_card("Sent", sms["sent"], sms["sent"], sms_prev["sent"])
          + _stat_card("Failed", sms["failed"])
      ))}

      {_section("WhatsApp", (
          _stat_card("Campaigns", wa["campaigns"])
          + _stat_card("Recipients", wa["total"])
          + _stat_card("Sent", wa["sent"], wa["sent"], wa_prev["sent"])
          + _stat_card("Failed", wa["failed"])
      ))}

      {_section("Bulk Email", (
          _stat_card("Campaigns", email["campaigns"])
          + _stat_card("Recipients", email["total"])
          + _stat_card("Sent", email["sent"], email["sent"], email_prev["sent"])
          + _stat_card("Failed / skipped", email["failed"] + email["skipped"])
      ))}

      {_insights_card("Key takeaways", insights["takeaways"])}
      {_insights_card("Recommendations", insights["recommendations"], accent="#f59e0b", bg="#fff7ed")}

      <div style="margin-top:30px;padding-top:10px;border-top:1px solid {_BORDER};font-size:9px;color:{_MUTED}">
        Prior-period change (&#9650;/&#9660;) compares against {prev_start.isoformat()} &mdash; {prev_end.isoformat()},
        the same length immediately before this period. Reach &amp; engagement figures are shown for the
        current period only -- platform analytics APIs report a rolling window ending today, not an
        arbitrary past range, so a reach trend isn't shown rather than estimating one.<br/>
        Tolkyn &middot; tolkyn.co.ke
      </div>
    </body>
    </html>
    """

    buf = io.BytesIO()
    pisa.CreatePDF(body, dest=buf)
    return buf.getvalue()


async def email_metrics_report(
    db: AsyncSession,
    workspace_id: Optional[str],
    start: date,
    end: date,
    to_email: str,
    reach_engagement: Optional[dict] = None,
):
    """Generates the same PDF as build_metrics_report_pdf and emails it as
    an attachment to `to_email` (the signed-in account's own address)."""
    from app.services.email_sender import BinaryAttachment
    from app.services.platform_mailer import send_branded

    pdf_bytes = await build_metrics_report_pdf(db, workspace_id, start, end, reach_engagement)
    filename = f"tolkyn-report-{start}-to-{end}.pdf"
    return await send_branded(
        to_email,
        f"Your Tolkyn performance report ({start} to {end})",
        heading="Your performance report is attached",
        body_lines=[
            f"Covers {start.isoformat()} to {end.isoformat()} -- social/content posts and "
            "SMS/WhatsApp/Email messaging, with reach & engagement and AI-written takeaways.",
            "Open the attached PDF to view it.",
        ],
        footnote="You're receiving this because you requested a report download from your Tolkyn dashboard.",
        attachment=BinaryAttachment(filename=filename, data=pdf_bytes, maintype="application", subtype="pdf"),
    )
