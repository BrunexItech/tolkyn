#!/usr/bin/env bash
# Asterisk voicemail externnotify hook (see etc/voicemail.conf.template).
# Fires whenever a message is left in any mailbox. Multi-tenant: doesn't
# trust externnotify's own positional args (they vary by Asterisk
# version/config) — instead scans every mailbox under the "default"
# voicemail context for a message this script hasn't sent yet, resolves
# which workspace owns that extension via AstDB (kept current by
# asterisk/sync_workspaces.py — same routing table the dialplan and the AMI
# bridge use), and POSTs to that workspace's webhook.
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
# Legacy single-tenant fallback — only used for the one extension that
# matches SOFTPHONE_EXT, and only until that workspace is migrated onto the
# multi-tenant routing table (see ami-bridge.py's own fallback for why).
LEGACY_WORKSPACE="${PBX_EVENT_WORKSPACE_ID:-_default}"
LEGACY_EXT="${SOFTPHONE_EXT:-}"
CONTEXT="default"
SPOOL_ROOT="/var/spool/asterisk/voicemail/${CONTEXT}"
[ -d "$SPOOL_ROOT" ] || exit 0

STATE_DIR="/var/lib/tolkyn"
mkdir -p "$STATE_DIR" 2>/dev/null || true

for MAILBOX_DIR in "$SPOOL_ROOT"/*/; do
    [ -d "$MAILBOX_DIR" ] || continue
    MAILBOX="$(basename "$MAILBOX_DIR")"
    SPOOL="${MAILBOX_DIR}INBOX"
    [ -d "$SPOOL" ] || continue

    WORKSPACE="$(asterisk -rx "database get tolkyn ext_ws/${MAILBOX}" 2>/dev/null | sed -n 's/^Value: //p')"
    if [ -z "$WORKSPACE" ]; then
        if [ -n "$LEGACY_EXT" ] && [ "$MAILBOX" = "$LEGACY_EXT" ]; then
            WORKSPACE="$LEGACY_WORKSPACE"
        else
            continue
        fi
    fi

    STATE_FILE="${STATE_DIR}/last-voicemail-${MAILBOX}"
    LAST_SENT="$(cat "$STATE_FILE" 2>/dev/null || true)"

    LATEST_TXT="$(ls -t "$SPOOL"/msg*.txt 2>/dev/null | head -1)"
    [ -z "$LATEST_TXT" ] && continue
    [ "$LATEST_TXT" = "$LAST_SENT" ] && continue

    BASE="${LATEST_TXT%.txt}"
    WAV="${BASE}.wav"
    [ -f "$WAV" ] || continue

    # The .txt Asterisk writes alongside every message — a stable, documented
    # sidecar format, far more reliable than trusting externnotify's own
    # positional args (which vary by Asterisk version/config).
    CALLERID_LINE="$(grep -m1 '^callerid=' "$LATEST_TXT" | cut -d= -f2-)"
    NUMBER="$(echo "$CALLERID_LINE" | grep -oE '[0-9+]{6,}' | head -1)"
    DURATION="$(grep -m1 '^duration=' "$LATEST_TXT" | cut -d= -f2-)"
    DURATION="${DURATION:-0}"

    TMP_B64="$(mktemp)"
    base64 -w0 "$WAV" > "$TMP_B64" 2>/dev/null
    if [ -s "$TMP_B64" ]; then
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
    fi
    rm -f "$TMP_B64"
done

exit 0
