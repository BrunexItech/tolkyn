#!/usr/bin/env python3
"""Tolkyn PBX -> backend call-event bridge.

Connects to Asterisk's AMI (Manager) socket on the host, follows each call by
its Linkedid, and POSTs a small normalised event to the Tolkyn backend webhook
whenever a call rings / is answered / ends. That's what makes the Call Center's
active-call card clear when the far end hangs up, and what records real
talk-time and missed calls.

Pure observation — no dialplan changes, no call control. Standard library only
(no pip installs on the host).

Config comes from the repo-root .env (same file install-on-host.sh reads):

    PBX_AMI_HOST=127.0.0.1
    PBX_AMI_PORT=5038
    PBX_AMI_USER=tolkyn-bridge
    PBX_AMI_PASSWORD=...
    PBX_EVENT_BACKEND_URL=http://127.0.0.1:8090/api/v1
    PBX_EVENT_WORKSPACE_ID=_default        # or a real workspace UUID
    PBX_EVENT_WEBHOOK_SECRET=...           # must match backend PBX_EVENT_WEBHOOK_SECRET
    SOFTPHONE_EXT=1001
"""
from __future__ import annotations

import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from typing import Dict, Optional, Set

# --- config -----------------------------------------------------------------
AMI_HOST = os.environ.get("PBX_AMI_HOST", "127.0.0.1")
AMI_PORT = int(os.environ.get("PBX_AMI_PORT", "5038"))
AMI_USER = os.environ.get("PBX_AMI_USER", "tolkyn-bridge")
AMI_PASS = os.environ.get("PBX_AMI_PASSWORD", "")
BACKEND = os.environ.get("PBX_EVENT_BACKEND_URL", "http://127.0.0.1:8090/api/v1").rstrip("/")
WORKSPACE = os.environ.get("PBX_EVENT_WORKSPACE_ID", "_default")
SECRET = os.environ.get("PBX_EVENT_WEBHOOK_SECRET", "")
AGENT_EXT = os.environ.get("SOFTPHONE_EXT", "1001")

WEBHOOK_URL = f"{BACKEND}/call-center/webhook/{WORKSPACE}/event"
TRUNK_CTX = {"from-cloudone"}
INTERNAL_CTX = {"from-internal"}


def log(*a: object) -> None:
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


# --- backend POST ---------------------------------------------------------
def post_event(payload: dict) -> None:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-Webhook-Secret": SECRET},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status not in (200, 204):
                log("webhook non-2xx:", resp.status)
    except urllib.error.HTTPError as e:
        log("webhook HTTP", e.code, e.read()[:200])
    except Exception as e:  # noqa: BLE001 - keep the bridge alive
        log("webhook error:", e)


# --- call tracking -------------------------------------------------------
class CallState:
    __slots__ = ("linkedid", "direction", "peer_number", "peer_name",
                 "channels", "answered", "ring_sent", "answered_sent", "started")

    def __init__(self, linkedid: str) -> None:
        self.linkedid = linkedid
        self.direction: Optional[str] = None
        self.peer_number = ""
        self.peer_name = ""
        self.channels: Set[str] = set()
        self.answered = False
        self.ring_sent = False
        self.answered_sent = False
        self.started = time.time()


calls: Dict[str, CallState] = {}


def _digits(s: str) -> str:
    return "".join(ch for ch in s if ch.isdigit() or ch == "+")


def _e164_ke(raw: str) -> str:
    """Normalise a caller ID the same way the dialplan does, so the number the
    backend gets from the AMI bridge matches the one the softphone reports."""
    n = "".join(ch for ch in raw if ch.isdigit())
    if not n:
        return raw
    if n.startswith("254"):
        return "+" + n
    if n.startswith("0"):
        return "+254" + n[1:]
    if len(n) == 9:
        return "+254" + n
    return raw if raw.startswith("+") else "+" + n


def _dialstring_number(dialstring: str) -> str:
    # "PJSIP/0712345678@cloudone" -> "0712345678"
    part = dialstring.split("/", 1)[-1]
    return part.split("@", 1)[0]


def on_newchannel(ev: Dict[str, str]) -> None:
    lid = ev.get("Linkedid") or ev.get("Uniqueid", "")
    uid = ev.get("Uniqueid", "")
    if not lid:
        return
    cs = calls.get(lid)
    is_new = cs is None
    if cs is None:
        cs = calls[lid] = CallState(lid)
    cs.channels.add(uid)
    if not is_new:
        return

    ctx = ev.get("Context", "")
    chan = ev.get("Channel", "")
    cid_num = ev.get("CallerIDNum", "") or ""
    cid_name = ev.get("CallerIDName", "") or ""
    exten = ev.get("Exten", "") or ""

    if ctx in TRUNK_CTX or chan.startswith("PJSIP/cloudone"):
        cs.direction = "inbound"
        cs.peer_number = _e164_ke(cid_num) if cid_num else ""
        cs.peer_name = cid_name if cid_name and not cid_name.isdigit() else ""
    elif ctx in INTERNAL_CTX or chan.startswith(f"PJSIP/{AGENT_EXT}"):
        cs.direction = "outbound"
        if exten and exten not in ("s", "i", "h") and exten.strip("0"):
            cs.peer_number = _digits(exten) or exten


def on_dialbegin(ev: Dict[str, str]) -> None:
    lid = ev.get("Linkedid", "")
    cs = calls.get(lid)
    if not cs:
        return
    dest = ev.get("DestChannel", "")
    dialstring = ev.get("DialString", "")

    if cs.direction == "outbound" and dialstring:
        num = _dialstring_number(dialstring)
        if num:
            cs.peer_number = _digits(num) or num
        if not cs.ring_sent:
            cs.ring_sent = True
            post_event({
                "type": "dialing",
                "direction": "outbound",
                "channel_id": lid,
                "callee_number": cs.peer_number or "unknown",
            })
    if cs.direction == "inbound" and dest.startswith(f"PJSIP/{AGENT_EXT}") and not cs.ring_sent:
        cs.ring_sent = True
        post_event({
            "type": "ring",
            "direction": "inbound",
            "channel_id": lid,
            "caller_number": cs.peer_number or "unknown",
            "caller_name": cs.peer_name or "Unknown caller",
        })


def _emit_answered(cs: CallState) -> None:
    if cs.answered_sent:
        return
    cs.answered = True
    cs.answered_sent = True
    cs.started = time.time()
    post_event({
        "type": "answered",
        "direction": cs.direction or "",
        "channel_id": cs.linkedid,
        "caller_number": cs.peer_number,
    })


def on_bridge_enter(ev: Dict[str, str]) -> None:
    lid = ev.get("Linkedid", "")
    cs = calls.get(lid)
    if cs:
        _emit_answered(cs)


def on_newstate(ev: Dict[str, str]) -> None:
    if ev.get("ChannelStateDesc") != "Up":
        return
    lid = ev.get("Linkedid", "")
    cs = calls.get(lid)
    if not cs:
        return
    chan = ev.get("Channel", "")
    # outbound: the trunk leg answering; inbound: the agent leg answering
    if (cs.direction == "outbound" and chan.startswith("PJSIP/cloudone")) or (
        cs.direction == "inbound" and chan.startswith(f"PJSIP/{AGENT_EXT}")
    ):
        _emit_answered(cs)


def on_hangup(ev: Dict[str, str]) -> None:
    lid = ev.get("Linkedid", "")
    uid = ev.get("Uniqueid", "")
    cs = calls.get(lid)
    if not cs:
        return
    cs.channels.discard(uid)
    if cs.channels:
        return
    cause = ev.get("Cause", "")
    if cs.answered:
        disp = "ANSWERED"
    elif cause == "17":
        disp = "BUSY"
    elif cause in ("21", "34", "38"):
        disp = "FAILED"
    else:
        disp = "NO ANSWER"
    duration = int(time.time() - cs.started) if cs.answered else 0
    post_event({
        "type": "hangup",
        "direction": cs.direction or "",
        "channel_id": lid,
        "duration": duration,
        "disposition": disp,
    })
    calls.pop(lid, None)


HANDLERS = {
    "Newchannel": on_newchannel,
    "DialBegin": on_dialbegin,
    "BridgeEnter": on_bridge_enter,
    "Newstate": on_newstate,
    "Hangup": on_hangup,
}


# --- AMI protocol ------------------------------------------------------------
def read_packet(buf: bytearray, sock: socket.socket) -> Optional[Dict[str, str]]:
    """Return the next AMI packet (dict of header->value) or None if the socket
    closed. Blocks until a full packet is available."""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            return None
        buf.extend(chunk)
    raw, _, rest = buf.partition(b"\r\n\r\n")
    del buf[:]
    buf.extend(rest)
    fields: Dict[str, str] = {}
    for line in raw.decode("utf-8", "replace").split("\r\n"):
        if ":" in line:
            k, _, v = line.partition(":")
            fields[k.strip()] = v.strip()
    return fields


def run_once() -> None:
    with socket.create_connection((AMI_HOST, AMI_PORT), timeout=10) as sock:
        sock.settimeout(None)
        buf = bytearray()
        # greeting line ("Asterisk Call Manager/x.y")
        try:
            sock.recv(4096)
        except OSError:
            pass
        sock.sendall(
            f"Action: Login\r\nUsername: {AMI_USER}\r\nSecret: {AMI_PASS}\r\n"
            "Events: call,cdr,system\r\n\r\n".encode()
        )
        login = read_packet(buf, sock)
        if not login or login.get("Response") != "Success":
            log("AMI login failed:", login)
            return
        log("AMI connected as", AMI_USER, "-> webhook", WEBHOOK_URL)

        last_ping = time.time()
        while True:
            pkt = read_packet(buf, sock)
            if pkt is None:
                log("AMI socket closed")
                return
            ev = pkt.get("Event")
            if ev in HANDLERS:
                try:
                    HANDLERS[ev](pkt)
                except Exception as e:  # noqa: BLE001
                    log("handler error", ev, e)
            now = time.time()
            if now - last_ping > 60:
                sock.sendall(b"Action: Ping\r\n\r\n")
                last_ping = now


def main() -> None:
    if not AMI_PASS or not SECRET:
        log("PBX_AMI_PASSWORD and PBX_EVENT_WEBHOOK_SECRET must be set — exiting")
        sys.exit(1)
    backoff = 2
    while True:
        try:
            run_once()
            backoff = 2
        except (OSError, ConnectionError) as e:
            log("AMI connection error:", e)
        except Exception as e:  # noqa: BLE001
            log("unexpected error:", e)
        time.sleep(backoff)
        backoff = min(backoff * 2, 30)


if __name__ == "__main__":
    main()
