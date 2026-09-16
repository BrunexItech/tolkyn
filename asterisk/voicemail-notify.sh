#!/usr/bin/env bash
# Asterisk voicemail externnotify hook (see etc/voicemail.conf.template).
# Fires whenever a message is left in any mailbox. Finds the newest
# not-yet-sent message for this box and POSTs its audio + caller info to the
# Tolkyn backend, so it shows up in the Call Center instead of sitting
# unseen in this spool folder. Reuses the same config the AMI bridge already
# has (asterisk/install-on-host.sh writes it) — no separate setup needed.
#
# Deliberately defensive throughout: never fails or blocks Asterisk's own
# voicemail delivery, always exits 0.
set -uo pipefail

CONF_ENV="/etc/tolkyn/ami-bridge.env"
[ -r "$CONF_ENV" ] || exit 0
set -a
# shellcheck disable=SC1090
. "$CONF_ENV"
set +a
[ -n "${PBX_EVENT_WEBHOOK_SECRET:-}" ] || exit 0

BACKEND="${PBX_EVENT_BACKEND_URL:-http://127.0.0.1:8090/api/v1}"
WORKSPACE="${PBX_EVENT_WORKSPACE_ID:-_default}"
MAILBOX="${SOFTPHONE_EXT:-1001}"
CONTEXT="default"
SPOOL="/var/spool/asterisk/voicemail/${CONTEXT}/${MAILBOX}/INBOX"
[ -d "$SPOOL" ] || exit 0

STATE_DIR="/var/lib/tolkyn"
mkdir -p "$STATE_DIR" 2>/dev/null || true
STATE_FILE="${STATE_DIR}/last-voicemail-${MAILBOX}"
LAST_SENT="$(cat "$STATE_FILE" 2>/dev/null || true)"

LATEST_TXT="$(ls -t "$SPOOL"/msg*.txt 2>/dev/null | head -1)"
[ -z "$LATEST_TXT" ] && exit 0
[ "$LATEST_TXT" = "$LAST_SENT" ] && exit 0

BASE="${LATEST_TXT%.txt}"
WAV="${BASE}.wav"
[ -f "$WAV" ] || exit 0

# The .txt Asterisk writes alongside every message — a stable, documented
# sidecar format, far more reliable than trusting externnotify's own
# positional args (which vary by Asterisk version/config).
CALLERID_LINE="$(grep -m1 '^callerid=' "$LATEST_TXT" | cut -d= -f2-)"
NUMBER="$(echo "$CALLERID_LINE" | grep -oE '[0-9+]{6,}' | head -1)"
DURATION="$(grep -m1 '^duration=' "$LATEST_TXT" | cut -d= -f2-)"
DURATION="${DURATION:-0}"

TMP_B64="$(mktemp)"
trap 'rm -f "$TMP_B64"' EXIT
base64 -w0 "$WAV" > "$TMP_B64" 2>/dev/null
[ -s "$TMP_B64" ] || exit 0

python3 - "$BACKEND" "$WORKSPACE" "$PBX_EVENT_WEBHOOK_SECRET" "$NUMBER" "$DURATION" "$TMP_B64" <<'PYEOF'
import json
import sys
import urllib.error
import urllib.request

backend, workspace, secret, number, duration, b64_path = sys.argv[1:7]
with open(b64_path) as f:
    audio_b64 = f.read().strip()

payload = {
    "type": "voicemail",
    "direction": "inbound",
    "caller_number": number,
    "duration": duration,
    "format": "wav",
    "audio_b64": audio_b64,
}
req = urllib.request.Request(
    f"{backend.rstrip('/')}/call-center/webhook/{workspace}/event",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json", "X-Webhook-Secret": secret},
    method="POST",
)
try:
    urllib.request.urlopen(req, timeout=20)
except Exception:
    pass
PYEOF

echo "$LATEST_TXT" > "$STATE_FILE" 2>/dev/null || true
exit 0
