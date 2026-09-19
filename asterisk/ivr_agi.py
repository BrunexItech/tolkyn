#!/usr/bin/env python3
"""Tolkyn PBX -> real-call IVR bridge (FastAGI server).

Asterisk hands a fresh inbound call to this over the network
(`AGI(agi://127.0.0.1:4573/ivr,${WS_ID})` in extensions.conf.template)
*before* ever dialing the workspace's agent. This script drives the actual
menu — plays each prompt as real audio, collects the caller's key press,
asks the backend's IVR runtime (app/api/v1/endpoints/ivr_runtime.py, which
just calls the same IvrService the dashboard's test tools already use) what
happens next — until the menu resolves to a terminal action. It then sets
channel variables Asterisk's dialplan branches on (IVR_NEXT / IVR_TARGET)
and returns control to the dialplan, which does the actual Dial()/
VoiceMail()/Hangup().

Never blocks a call indefinitely: any error talking to the backend, or an
unexpected response, falls back to "agent" (ring the workspace's own line —
the exact behaviour every call already had before this script existed).

Pure standard library — no pip installs on the host. One thread per call
(ThreadingTCPServer); each call gets its own short-lived connection.

Config comes from the same file the AMI bridge and voicemail-notify.sh
already read (asterisk/install-on-host.sh writes it):

    PBX_EVENT_BACKEND_URL=http://127.0.0.1:8090/api/v1
    PBX_EVENT_WEBHOOK_SECRET=...
"""
from __future__ import annotations

import json
import os
import re
import socket
import socketserver
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, Optional

AGI_PORT = int(os.environ.get("IVR_AGI_PORT", "4573"))
BACKEND = os.environ.get("PBX_EVENT_BACKEND_URL", "http://127.0.0.1:8090/api/v1").rstrip("/")
BACKEND_ROOT = BACKEND[: -len("/api/v1")] if BACKEND.endswith("/api/v1") else BACKEND
SECRET = os.environ.get("PBX_EVENT_WEBHOOK_SECRET", "")
RUNTIME_URL = f"{BACKEND}/call-center/ivr-runtime"
SOUNDS_DIR = Path("/var/lib/asterisk/sounds/tolkyn-ivr")

ESCAPE_DIGITS = "0123456789*#"


def log(*a: object) -> None:
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


# --- backend calls -----------------------------------------------------
def call_backend(path: str, payload: dict) -> Optional[dict]:
    req = urllib.request.Request(
        f"{RUNTIME_URL}/{path}",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "X-Webhook-Secret": SECRET},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:  # noqa: BLE001 — never let a backend hiccup hang a call
        log("backend call failed:", path, e)
        return None


def fetch_audio(rel_path: str) -> Optional[str]:
    """Downloads + caches the rendered prompt audio locally; returns the
    Asterisk STREAM FILE argument (no extension) or None on any failure."""
    key = re.sub(r"[^a-zA-Z0-9_-]", "", Path(rel_path).stem)
    if not key:
        return None
    dest = SOUNDS_DIR / f"{key}.wav"
    if dest.is_file() and dest.stat().st_size > 0:
        return f"tolkyn-ivr/{key}"
    try:
        SOUNDS_DIR.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(f"{BACKEND_ROOT}/media/{rel_path}", timeout=10) as resp:
            data = resp.read()
        if not data:
            return None
        dest.write_bytes(data)
        return f"tolkyn-ivr/{key}"
    except Exception as e:  # noqa: BLE001
        log("audio fetch failed:", rel_path, e)
        return None


# --- AGI protocol --------------------------------------------------------
class AGIError(Exception):
    pass


class AGISession:
    def __init__(self, rfile, wfile) -> None:
        self.rfile = rfile
        self.wfile = wfile
        self.env: Dict[str, str] = {}

    def read_env(self) -> None:
        while True:
            line = self.rfile.readline().decode("utf-8", "replace").strip("\r\n")
            if not line:
                break
            if ":" in line:
                k, _, v = line.partition(":")
                self.env[k.strip()] = v.strip()

    def command(self, cmd: str) -> str:
        self.wfile.write((cmd.strip() + "\n").encode())
        self.wfile.flush()
        line = self.rfile.readline().decode("utf-8", "replace").strip()
        return line

    def result_of(self, response: str) -> int:
        m = re.search(r"result=(-?\d+)", response)
        return int(m.group(1)) if m else -1

    def answer(self) -> None:
        self.command("ANSWER")

    def stream_file(self, filename: str, escape_digits: str = ESCAPE_DIGITS) -> str:
        """Plays filename, interruptible by any of escape_digits. Returns the
        pressed digit (e.g. "1") if interrupted, or "" if it played through
        (or failed to play at all — treated the same as silence)."""
        resp = self.command(f'STREAM FILE {filename} "{escape_digits}"')
        code = self.result_of(resp)
        return chr(code) if code > 0 else ""

    def wait_for_digit(self, timeout_ms: int) -> str:
        resp = self.command(f"WAIT FOR DIGIT {timeout_ms}")
        code = self.result_of(resp)
        return chr(code) if code > 0 else ""

    def set_variable(self, name: str, value: str) -> None:
        safe = (value or "").replace('"', "")
        self.command(f'SET VARIABLE {name} "{safe}"')


def collect_one_digit(agi: AGISession, audio_key: Optional[str], timeout_seconds: int) -> str:
    """Plays the prompt (if any), letting the caller barge in with a digit;
    otherwise waits out the rest of the timeout for one. Answers the channel
    first if it hasn't been already — only happens once we actually have
    something to say, so a workspace with the IVR off never gets an early
    answer it didn't have before."""
    agi.answer()
    digit = ""
    if audio_key:
        digit = agi.stream_file(audio_key)
    if not digit:
        digit = agi.wait_for_digit(max(1, timeout_seconds) * 1000)
    return digit


def run_ivr(agi: AGISession) -> None:
    workspace_id = agi.env.get("agi_arg_1", "")
    channel_id = agi.env.get("agi_uniqueid", "")
    caller_number = agi.env.get("agi_callerid", "") or ""

    if not workspace_id or not channel_id:
        log("missing workspace_id/channel_id — falling back to agent")
        agi.set_variable("IVR_NEXT", "agent")
        return

    directive = call_backend("enter", {
        "workspace_id": workspace_id,
        "channel_id": channel_id,
        "caller_number": caller_number,
    })
    if directive is None:
        agi.set_variable("IVR_NEXT", "agent")
        return

    call_id = directive.get("call_id")
    hops = 0
    while directive and directive.get("then") == "menu" and hops < 10:
        hops += 1
        audio_key = fetch_audio(directive["say"]) if directive.get("say") else None
        digit = collect_one_digit(agi, audio_key, int(directive.get("timeout") or 7))
        if digit:
            directive = call_backend("digit", {"call_id": call_id, "digit": digit})
        else:
            directive = call_backend("timeout", {"call_id": call_id})
        if directive is None:
            agi.set_variable("IVR_NEXT", "agent")
            return

    if not directive:
        agi.set_variable("IVR_NEXT", "agent")
        return

    then = directive.get("then", "agent")
    if then == "hangup" and directive.get("say"):
        audio_key = fetch_audio(directive["say"])
        agi.answer()
        if audio_key:
            agi.stream_file(audio_key, escape_digits="")
    agi.set_variable("IVR_NEXT", then)
    if then == "transfer":
        agi.set_variable("IVR_TARGET", directive.get("target") or "")


class Handler(socketserver.StreamRequestHandler):
    def handle(self) -> None:
        agi = AGISession(self.rfile, self.wfile)
        try:
            agi.read_env()
            run_ivr(agi)
        except Exception as e:  # noqa: BLE001 — a bug here must never hang the call
            log("AGI session error:", e)
            try:
                agi.set_variable("IVR_NEXT", "agent")
            except Exception:  # noqa: BLE001
                pass


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    if not SECRET:
        log("PBX_EVENT_WEBHOOK_SECRET not set — exiting")
        sys.exit(1)
    server = Server(("127.0.0.1", AGI_PORT), Handler)
    log(f"listening on 127.0.0.1:{AGI_PORT} -> backend {BACKEND}")
    server.serve_forever()


if __name__ == "__main__":
    main()
