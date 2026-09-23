"""Low-level SMTP send (stdlib smtplib, run in a worker thread)."""
import asyncio
import html as html_lib
import logging
import smtplib
import ssl
import uuid
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import List, Optional

logger = logging.getLogger(__name__)

_DEFAULT_ACCENT = "#94a3b8"


def _text_to_html(text: str) -> str:
    """Plain text -> safe HTML: escape, then turn blank-line-separated blocks
    into paragraphs and single newlines into <br>, so a plain-text compose
    box still reads naturally once wrapped in the branded template."""
    escaped = html_lib.escape(text or "")
    paragraphs = [p.replace("\n", "<br>") for p in escaped.split("\n\n") if p.strip()]
    return "".join(f'<p style="margin:0 0 16px;">{p}</p>' for p in paragraphs)


def render_branded_html(
    body: str,
    *,
    logo_url: Optional[str] = None,
    brand_colors: Optional[List[str]] = None,
    signature: Optional[str] = None,
    contact_phone: Optional[str] = None,
    contact_website: Optional[str] = None,
) -> str:
    """Wraps a plain-text message in a simple, professional, table-based HTML
    email -- deliberately basic markup (no flexbox/grid) since email clients
    have much narrower CSS support than browsers. logo_url must already be an
    absolute URL (a mail client can't resolve a relative path)."""
    accent = (brand_colors or [None])[0] or _DEFAULT_ACCENT
    logo_row = (
        f'<tr><td style="padding:24px 32px 0;">'
        f'<img src="{html_lib.escape(logo_url)}" alt="" style="max-height:48px; max-width:220px; display:block;">'
        f"</td></tr>"
        if logo_url
        else ""
    )
    # Optional one-line contact strip under the signature -- only appears if
    # the workspace's profile actually has a phone/website set (Settings).
    contact_bits = [c for c in (contact_phone, contact_website) if c and c.strip()]
    contact_line = (
        f'<div style="margin-top:6px; color:#9ca3af; font-size:11.5px;">'
        f'{html_lib.escape(" · ".join(b.strip() for b in contact_bits))}</div>'
        if contact_bits
        else ""
    )
    footer_body = f'<div style="color:#6b7280; font-size:12.5px; line-height:1.6;">{_text_to_html(signature)}</div>' if signature else ""
    signature_row = (
        f'<tr><td style="padding:0 32px 28px;">'
        f'<div style="border-top:1px solid #e5e7eb; margin-bottom:16px;"></div>'
        f"{footer_body}{contact_line}"
        f"</td></tr>"
        if (signature or contact_line)
        else '<tr><td style="padding-bottom:8px;"></td></tr>'
    )
    return f"""<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:#f4f4f5; font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; max-width:92vw;">
            <tr><td style="height:4px; background:{html_lib.escape(accent)}; font-size:0; line-height:0;">&nbsp;</td></tr>
            {logo_row}
            <tr>
              <td style="padding:24px 32px; color:#1f2937; font-size:14px; line-height:1.6;">
                {_text_to_html(body)}
              </td>
            </tr>
            {signature_row}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


@dataclass
class SmtpConfig:
    host: str
    port: int
    username: str
    password: str
    use_tls: bool = True   # STARTTLS (587)
    use_ssl: bool = False   # implicit TLS (465)
    from_name: str = ""
    from_email: str = ""
    reply_to: Optional[str] = None
    bcc: Optional[str] = None


@dataclass
class SendOutcome:
    ok: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


def _build_message(
    cfg: SmtpConfig,
    to_email: str,
    subject: str,
    body: str,
    attachment: Optional[tuple[str, str]] = None,  # (filename, text)
    html: Optional[str] = None,
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((cfg.from_name or cfg.from_email, cfg.from_email))
    msg["To"] = to_email
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid()
    if cfg.reply_to:
        msg["Reply-To"] = cfg.reply_to
    if cfg.bcc:
        # smtplib's send_message() reads To/Cc/Bcc headers to build the
        # actual SMTP envelope recipient list when none is passed
        # explicitly, then automatically STRIPS the Bcc header before the
        # message bytes go out -- so the bcc address receives a full copy
        # while staying completely invisible to the recipient (never in
        # the raw source, never included in a "reply all"), same as any
        # normal mail client's Bcc field.
        msg["Bcc"] = cfg.bcc
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")
    if attachment:
        fname, text = attachment
        msg.add_attachment(
            text.encode("utf-8"),
            maintype="text",
            subtype="markdown",
            filename=fname,
        )
    return msg


def _send_sync(cfg: SmtpConfig, msg: EmailMessage) -> SendOutcome:
    # Temporary: "Connection unexpectedly closed" on send (but not on a bare
    # connect+login) has been persistent and unexplained -- split login and
    # send_message into separate stages and log the full exception (type +
    # args, and the raw SMTP response code/text if smtplib captured one) so
    # the next real attempt tells us exactly where and why, instead of just
    # the short summary string shown in the UI.
    stage = "connect"
    try:
        if cfg.use_ssl:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=30, context=ctx) as s:
                stage = "login"
                s.login(cfg.username, cfg.password)
                stage = "send"
                s.send_message(msg)
        else:
            with smtplib.SMTP(cfg.host, cfg.port, timeout=30) as s:
                s.ehlo()
                if cfg.use_tls:
                    stage = "starttls"
                    s.starttls(context=ssl.create_default_context())
                    s.ehlo()
                stage = "login"
                s.login(cfg.username, cfg.password)
                stage = "send"
                s.send_message(msg)
        return SendOutcome(ok=True, message_id=msg["Message-ID"])
    except smtplib.SMTPAuthenticationError as exc:
        logger.warning("SMTP auth failed at stage=%s: %r", stage, exc)
        return SendOutcome(ok=False, error="Authentication failed — check the username / app password.")
    except smtplib.SMTPConnectError as exc:
        logger.warning("SMTP connect failed at stage=%s: %r", stage, exc)
        return SendOutcome(ok=False, error="Could not connect to the SMTP server (host/port).")
    except smtplib.SMTPRecipientsRefused as exc:
        logger.warning("SMTP recipients refused at stage=%s: %r", stage, exc)
        return SendOutcome(ok=False, error="The recipient address was refused by the server.")
    except (smtplib.SMTPException, ssl.SSLError, OSError) as exc:
        logger.warning(
            "SMTP error at stage=%s: type=%s args=%r repr=%r",
            stage, type(exc).__name__, getattr(exc, "args", None), exc,
        )
        return SendOutcome(ok=False, error=f"SMTP error: {exc}")


async def send_email(
    cfg: SmtpConfig,
    to_email: str,
    subject: str,
    body: str,
    attachment: Optional[tuple[str, str]] = None,
    html: Optional[str] = None,
) -> SendOutcome:
    msg = _build_message(cfg, to_email, subject, body, attachment, html)
    return await asyncio.to_thread(_send_sync, cfg, msg)


async def verify_smtp(cfg: SmtpConfig) -> SendOutcome:
    """Connect + auth without sending, to verify credentials."""
    def _check() -> SendOutcome:
        try:
            if cfg.use_ssl:
                with smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=20,
                                      context=ssl.create_default_context()) as s:
                    s.login(cfg.username, cfg.password)
            else:
                with smtplib.SMTP(cfg.host, cfg.port, timeout=20) as s:
                    s.ehlo()
                    if cfg.use_tls:
                        s.starttls(context=ssl.create_default_context())
                        s.ehlo()
                    s.login(cfg.username, cfg.password)
            return SendOutcome(ok=True)
        except smtplib.SMTPAuthenticationError:
            return SendOutcome(ok=False, error="Authentication failed — check the username / app password.")
        except Exception as exc:  # noqa: BLE001
            return SendOutcome(ok=False, error=str(exc))

    return await asyncio.to_thread(_check)
