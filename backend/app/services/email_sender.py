"""Low-level SMTP send (stdlib smtplib, run in a worker thread)."""
import asyncio
import smtplib
import ssl
import uuid
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Optional


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
    try:
        if cfg.use_ssl:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=30, context=ctx) as s:
                s.login(cfg.username, cfg.password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(cfg.host, cfg.port, timeout=30) as s:
                s.ehlo()
                if cfg.use_tls:
                    s.starttls(context=ssl.create_default_context())
                    s.ehlo()
                s.login(cfg.username, cfg.password)
                s.send_message(msg)
        return SendOutcome(ok=True, message_id=msg["Message-ID"])
    except smtplib.SMTPAuthenticationError:
        return SendOutcome(ok=False, error="Authentication failed — check the username / app password.")
    except smtplib.SMTPConnectError:
        return SendOutcome(ok=False, error="Could not connect to the SMTP server (host/port).")
    except smtplib.SMTPRecipientsRefused:
        return SendOutcome(ok=False, error="The recipient address was refused by the server.")
    except (smtplib.SMTPException, ssl.SSLError, OSError) as exc:
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
