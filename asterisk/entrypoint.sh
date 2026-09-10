#!/bin/sh
# Render config templates with the runtime env vars, then run Asterisk in the
# foreground. Only the listed shell vars are substituted — Asterisk's own
# ${...} dialplan syntax is left untouched.
set -e

: "${CLOUDONE_SIP_HOST:?CLOUDONE_SIP_HOST is required}"
: "${CLOUDONE_SIP_USER:?CLOUDONE_SIP_USER is required}"
: "${CLOUDONE_SIP_PASSWORD:?CLOUDONE_SIP_PASSWORD is required}"
: "${CLOUDONE_DID:?CLOUDONE_DID is required}"
: "${PBX_PUBLIC_IP:?PBX_PUBLIC_IP is required}"
: "${SOFTPHONE_EXT:?SOFTPHONE_EXT is required}"
: "${SOFTPHONE_EXT_PASSWORD:?SOFTPHONE_EXT_PASSWORD is required}"
: "${PBX_WS_PORT:=8188}"
: "${PBX_TURN_USER:=tolkyn}"
: "${PBX_TURN_PASSWORD:?PBX_TURN_PASSWORD is required}"
export CLOUDONE_SIP_HOST CLOUDONE_SIP_USER CLOUDONE_SIP_PASSWORD CLOUDONE_DID \
       PBX_PUBLIC_IP SOFTPHONE_EXT SOFTPHONE_EXT_PASSWORD PBX_WS_PORT \
       PBX_TURN_USER PBX_TURN_PASSWORD

TPL=/opt/asterisk-templates
DEST=/etc/asterisk
SUBST='${CLOUDONE_SIP_HOST} ${CLOUDONE_SIP_USER} ${CLOUDONE_SIP_PASSWORD} ${CLOUDONE_DID} ${PBX_PUBLIC_IP} ${SOFTPHONE_EXT} ${SOFTPHONE_EXT_PASSWORD} ${PBX_WS_PORT} ${PBX_TURN_USER} ${PBX_TURN_PASSWORD}'

for f in "$TPL"/*.template; do
    name=$(basename "$f" .template)
    envsubst "$SUBST" < "$f" > "$DEST/$name"
done
for f in "$TPL"/*.conf; do
    cp "$f" "$DEST/$(basename "$f")"
done

# writable spool/log/lib for the asterisk user (matters once volumes are mounted)
chown -R asterisk:asterisk /var/lib/asterisk /var/log/asterisk /var/spool/asterisk /var/run/asterisk 2>/dev/null || true

echo "Asterisk starting — trunk ${CLOUDONE_SIP_USER}@${CLOUDONE_SIP_HOST}, DID ${CLOUDONE_DID}, ext ${SOFTPHONE_EXT}, WS 127.0.0.1:${PBX_WS_PORT}"
# -f: foreground (no fork) for the container; run as the asterisk user
exec /usr/sbin/asterisk -f -U asterisk -G asterisk
