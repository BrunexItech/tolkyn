"""Branded Tolkyn email — one dark, restrained template used for every
transactional message (password reset, verification, invites, announcements).
Returns (html, plain_text) so the message always carries both."""
from __future__ import annotations

import html as _html
from typing import List, Optional, Tuple

_BRAND = "Tolkyn"
_ACCENT = "#4f7cff"
_BG = "#0f1115"
_CARD = "#171a21"
_TEXT = "#e6e8ec"
_MUTED = "#9aa0aa"
_BORDER = "#262a33"


def render_email(
    *,
    heading: str,
    body_lines: List[str],
    button_label: Optional[str] = None,
    button_url: Optional[str] = None,
    footnote: Optional[str] = None,
    preheader: Optional[str] = None,
) -> Tuple[str, str]:
    safe_lines = [f"<p style='margin:0 0 14px;color:{_TEXT};font-size:15px;line-height:1.6'>{_html.escape(l)}</p>" for l in body_lines]
    button_html = ""
    if button_label and button_url:
        button_html = f"""
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0">
          <tr><td style="border-radius:8px;background:{_ACCENT}">
            <a href="{_html.escape(button_url, quote=True)}"
               style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;
                      color:#ffffff;text-decoration:none;border-radius:8px">{_html.escape(button_label)}</a>
          </td></tr>
        </table>
        <p style="margin:0 0 14px;color:{_MUTED};font-size:12px;word-break:break-all">
          Or paste this link into your browser:<br>
          <a href="{_html.escape(button_url, quote=True)}" style="color:{_ACCENT}">{_html.escape(button_url)}</a>
        </p>"""

    foot_html = (
        f"<p style='margin:18px 0 0;color:{_MUTED};font-size:12px;line-height:1.6'>{_html.escape(footnote)}</p>"
        if footnote
        else ""
    )
    pre = (
        f"<span style='display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden'>{_html.escape(preheader)}</span>"
        if preheader
        else ""
    )

    html_doc = f"""<!doctype html>
<html><body style="margin:0;padding:0;background:{_BG}">
{pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG};padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
      <tr><td style="padding:6px 4px 16px">
        <span style="font-size:19px;font-weight:700;letter-spacing:-0.02em;color:{_TEXT}">{_BRAND}</span>
      </td></tr>
      <tr><td style="background:{_CARD};border:1px solid {_BORDER};border-radius:14px;padding:28px">
        <h1 style="margin:0 0 16px;font-size:19px;font-weight:650;color:{_TEXT}">{_html.escape(heading)}</h1>
        {''.join(safe_lines)}
        {button_html}
        {foot_html}
      </td></tr>
      <tr><td style="padding:16px 4px;color:{_MUTED};font-size:11px;line-height:1.6">
        Sent by {_BRAND}. If you weren't expecting this email you can safely ignore it.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""

    text_parts = [heading, ""] + body_lines
    if button_label and button_url:
        text_parts += ["", f"{button_label}: {button_url}"]
    if footnote:
        text_parts += ["", footnote]
    text_parts += ["", f"— {_BRAND}"]
    return html_doc, "\n".join(text_parts)
