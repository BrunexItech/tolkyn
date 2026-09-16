#!/usr/bin/env python3
"""Tolkyn PBX -> backend call-event bridge.

Connects to Asterisk's AMI (Manager) socket on the host, follows each call by
its Linkedid, and POSTs a small normalised event to the Tolkyn backend webhook
whenever a call rings / is answered / ends. That's what makes the Call Center's
active-call card clear when the far end hangs up, and what records real
talk-time and missed calls.

Multi-tenant: one Asterisk serves every workspace's calls, so every event has
to be attributed to the *right* workspace before it's posted — inbound calls
are resolved from the DID that was dialled, outbound calls from the agent
extension that placed them, both via the same routing table
asterisk/sync_workspaces.py keeps current (fetched here straight from the
backend, refreshed in the background, never guessed). If a call can't be
resolved to a workspace, the event is dropped and logged rather than posted
to a possibly-wrong workspace's webhook.

Pure observation — no dialplan changes, no call control. Standard library only
(no pip installs on the host).

Config comes from the repo-root .env (same file install-on-host.sh reads):

    PBX_AMI_HOST=127.0.0.1
    PBX_AMI_PORT=5038
    PBX_AMI_USER=tolkyn-bridge
    PBX_AMI_PASSWORD=...
    PBX_EVENT_BACKEND_URL=http://127.0.0.1:8090/api/v1
    PBX_EVENT_WORKSPACE_ID=_default   # legacy single-tenant fallback only —
                                       # used only while no workspace has been
                                       # assigned a DID/extension yet
    PBX_EVENT_WEBHOOK_SECRET=...      # must match backend PBX_EVENT_WEBHOOK_SECRET
    SOFTPHONE_EXT=1001                # legacy single-tenant fallback only
"""
from __future__ import annotations

import base64
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, Optional, Set, Tuple

# --- config -----------------------------------------------------------------
AMI_HOST = os.environ.get("PBX_AMI_HOST", "127.0.0.1")
AMI_PORT = int(os.environ.get("PBX_AMI_PORT", "5038"))
AMI_USER = os.environ.get("PBX_AMI_USER", "tolkyn-bridge")
AMI_PASS = os.environ.get("PBX_AMI_PASSWORD", "")
BACKEND = os.environ.get("PBX_EVENT_BACKEND_URL", "http://127.0.0.1:8090/api/v1").rstrip("/")
SECRET = os.environ.get("PBX_EVENT_WEBHOOK_SECRET", "")
ROUTING_URL = f"{BACKEND}/call-center/pbx-routing"

# Legacy single-tenant fallback — only used when the routing table has never
# had anything in it (i.e. no workspace has been assigned a DID + extension
# yet through super admin). Once even one workspace is live, an unresolved
# call is dropped rather than guessed, so two clients' calls can never mix.
LEGACY_WORKSPACE = os.environ.get("PBX_EVENT_WORKSPACE_ID", "_default")
LEGACY_EXT = os.environ.get("SOFTPHONE_EXT", "")

TRUNK_CTX = {"from-cloudone"}
INTERNAL_CTX = {"from-internal"}
_EXT_RE = re.compile(r"^PJSIP/([^-]+)-")

# Call recording — MixMonitor (see extensions.conf.template's rec-gate) writes
# here, named by Linkedid, only for workspaces with recording turned on.
RECORDINGS_DIR = Path("/var/spool/asterisk/recordings")
MAX_RECORDING_BYTES = 25 * 1024 * 1024  # ~50min of G.711 8kHz mono — plenty


def log(*a: object) -> None:
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


# --- routing table (DID / extension -> workspace_id) ------------------------
_routing_lock = threading.Lock()
_routing: Dict[str, Dict[str, str]] = {"by_did9": {}, "by_ext": {}}


def _digits(s: str) -> str:
    return "".join(ch for ch in s if ch.isdigit() or ch == "+")


def _last9(s: str) -> str:
    d = "".join(ch for ch in s if ch.isdigit())
    return d[-9:] if len(d) >= 9 else d


def _refresh_routing_once() -> None:
    req = urllib.request.Request(ROUTING_URL, headers={"X-Webhook-Secret": SECRET})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    by_did9: Dict[str, str] = {}
    by_ext: Dict[str, str] = {}
    for ln in data.get("lines", []):
        did9 = _last9(ln.get("did", ""))
        ext = ln.get("extension", "")
        ws = ln.get("workspace_id", "")
        if did9 and ws:
            by_did9[did9] = ws
        if ext and ws:
            by_ext[ext] = ws
    with _routing_lock:
        _routing["by_did9"] = by_did9
        _routing["by_ext"] = by_ext


def _routing_loop() -> None:
    while True:
        try:
            _refresh_routing_once()
        except Exception as e:  # noqa: BLE001 — keep polling regardless
            log("routing refresh error:", e)
        time.sleep(30)


def workspace_for_did(exten: str) -> str:
    did9 = _last9(exten)
    with _routing_lock:
        ws = _routing["by_did9"].get(did9, "")
        empty = not _routing["by_did9"] and not _routing["by_ext"]
    if ws:
        return ws
    if empty and did9 and LEGACY_EXT:
        return LEGACY_WORKSPACE
    return ""


def workspace_for_channel(chan: str) -> str:
    m = _EXT_RE.match(chan)
    ext = m.group(1) if m else ""
    with _routing_lock:
        ws = _routing["by_ext"].get(ext, "")
        empty = not _routing["by_did9"] and not _routing["by_ext"]
    if ws:
        return ws
    if empty and ext and LEGACY_EXT and ext == LEGACY_EXT:
        return LEGACY_WORKSPACE
    return ""


# --- backend POST ---------------------------------------------------------
def post_event(workspace_id: str, payload: dict, timeout: int = 5) -> bool:
    if not workspace_id:
        log("dropping event — could not resolve a workspace:", payload.get("type"))
        return False
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BACKEND}/call-center/webhook/{workspace_id}/event",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-Webhook-Secret": SECRET},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status not in (200, 204):
                log("webhook non-2xx:", resp.status)
                return False
            return True
    except urllib.error.HTTPError as e:
        log("webhook HTTP", e.code, e.read()[:200])
    except Exception as e:  # noqa: BLE001 - keep the bridge alive
        log("webhook error:", e)
    return False


def _recording_payload(lid: str) -> Tuple[dict, Optional[Path]]:
    """The finished MixMonitor recording for this call, if the dialplan
    recorded one — read once, base64-encoded, ready to ride on the hangup
    event. Returns ({} , None) when there's nothing to attach."""
    path = RECORDINGS_DIR / f"{lid}.wav"
    try:
        size = path.stat().st_size
    except OSError:
        return {}, None
    if size <= 0:
        return {}, None
    if size > MAX_RECORDING_BYTES:
        log(f"recording {path} is {size} bytes — over the cap, skipping")
        return {}, None
    try:
        data = path.read_bytes()
    except OSError as e:
        log("recording read error:", e)
        return {}, None
    return {"recording_b64": base64.b64encode(data).decode(), "format": "wav"}, path


# --- call tracking -------------------------------------------------------
class CallState:
    __slots__ = ("linkedid", "direction", "workspace_id", "peer_number", "peer_name",
                 "channels", "answered", "ring_sent", "answered_sent", "started")

    def __init__(self, linkedid: str) -> None:
        self.linkedid = linkedid
        self.direction: Optional[str] = None
        self.workspace_id = ""
        self.peer_number = ""
        self.peer_name = ""
        self.channels: Set[str] = set()
        self.answered = False
        self.ring_sent = False
        self.answered_sent = False
        self.started = time.time()


calls: Dict[str, CallState] = {}


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
        # the DID actually dialled — resolves which workspace this call
        # belongs to, before any agent extension has even been chosen.
        cs.workspace_id = workspace_for_did(exten)
    elif ctx in INTERNAL_CTX or _EXT_RE.match(chan):
        cs.direction = "outbound"
        cs.workspace_id = workspace_for_channel(chan)
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
            post_event(cs.workspace_id, {
                "type": "dialing",
                "direction": "outbound",
                "channel_id": lid,
                "callee_number": cs.peer_number or "unknown",
            })
    if cs.direction == "inbound" and _EXT_RE.match(dest) and not cs.ring_sent:
        cs.ring_sent = True
        post_event(cs.workspace_id, {
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
    post_event(cs.workspace_id, {
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
    # (exclude the trunk leg itself here — it also matches _EXT_RE and goes
    # "Up" well before any agent has answered).
    if (cs.direction == "outbound" and chan.startswith("PJSIP/cloudone")) or (
        cs.direction == "inbound" and not chan.startswith("PJSIP/cloudone") and bool(_EXT_RE.match(chan))
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
    rec_fields, rec_path = _recording_payload(lid)
    ok = post_event(
        cs.workspace_id,
        {
            "type": "hangup",
            "direction": cs.direction or "",
            "channel_id": lid,
            "duration": duration,
            "disposition": disp,
            **rec_fields,
        },
        timeout=30 if rec_fields else 5,
    )
    if ok and rec_path:
        try:
            rec_path.unlink()
        except OSError:
            pass  # not fatal — just leaves a file behind on this one host
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
        log("AMI connected as", AMI_USER, "-> backend", BACKEND)

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
    threading.Thread(target=_routing_loop, daemon=True).start()
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
