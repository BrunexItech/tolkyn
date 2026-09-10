#!/usr/bin/env bash
#
# Install Asterisk directly on the Ubuntu host (not in Docker) and render the
# Tolkyn PBX config from the values in ../.env.
#
# Run from the repo root:   sudo bash asterisk/install-on-host.sh
#
# A containerised PBX never got WebRTC media working — Docker's network layer
# breaks RTP/ICE. Run natively: Asterisk sees the public IP directly, RTP and
# ICE just work.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ENV_FILE="$ROOT/.env"
TPL="$HERE/etc"

[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "no $ENV_FILE — run from the repo root"; exit 1; }

# --- load the vars we need from .env ---------------------------------------
set -a; . "$ENV_FILE"; set +a
: "${CLOUDONE_SIP_HOST:?set in .env}"
: "${CLOUDONE_SIP_USER:?set in .env}"
: "${CLOUDONE_SIP_PASSWORD:?set in .env}"
: "${CLOUDONE_DID:?set in .env}"
: "${PBX_PUBLIC_IP:?set in .env}"
: "${SOFTPHONE_EXT:?set in .env}"
: "${SOFTPHONE_EXT_PASSWORD:?set in .env}"
: "${PBX_WS_PORT:=8188}"
export CLOUDONE_SIP_HOST CLOUDONE_SIP_USER CLOUDONE_SIP_PASSWORD CLOUDONE_DID \
       PBX_PUBLIC_IP SOFTPHONE_EXT SOFTPHONE_EXT_PASSWORD PBX_WS_PORT

# --- 1. stop the container PBX so it can't fight over :5060 ----------------
echo "==> stopping the Asterisk container (if running)"
( cd "$ROOT" && docker-compose stop asterisk coturn 2>/dev/null ) || true

# --- 2. install Asterisk -------------------------------------------------
if ! command -v asterisk >/dev/null; then
  echo "==> installing asterisk"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends asterisk gettext-base
fi

# --- 3. render our config over the stock config -------------------------
echo "==> writing /etc/asterisk config"
SUBST='${CLOUDONE_SIP_HOST} ${CLOUDONE_SIP_USER} ${CLOUDONE_SIP_PASSWORD} ${CLOUDONE_DID} ${PBX_PUBLIC_IP} ${SOFTPHONE_EXT} ${SOFTPHONE_EXT_PASSWORD} ${PBX_WS_PORT}'
for f in "$TPL"/*.template; do
  name="$(basename "$f" .template)"
  envsubst "$SUBST" < "$f" > "/etc/asterisk/$name"
done
for f in "$TPL"/*.conf; do
  cp "$f" "/etc/asterisk/$(basename "$f")"
done
chown -R asterisk:asterisk /etc/asterisk /var/lib/asterisk /var/log/asterisk /var/spool/asterisk /var/run/asterisk 2>/dev/null || true

# --- 4. firewall: only Cloud One may reach SIP; RTP open --------------
echo "==> firewall rules for :5060 (INPUT chain — native, no Docker)"
CLOUDONE_IP="$(getent hosts "$CLOUDONE_SIP_HOST" | awk '{print $1}' | head -1)"
# wipe any earlier attempts we made in raw / DOCKER-USER
iptables -t raw -F PREROUTING 2>/dev/null || true
iptables -F DOCKER-USER 2>/dev/null && iptables -A DOCKER-USER -j RETURN || true
# clean re-add in INPUT
for ip in "$CLOUDONE_IP" 102.164.53.14; do
  iptables -C INPUT -p udp --dport 5060 -s "$ip" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p udp --dport 5060 -s "$ip" -j ACCEPT
done
iptables -C INPUT -p udp --dport 5060 -j DROP 2>/dev/null || iptables -A INPUT -p udp --dport 5060 -j DROP
iptables -C INPUT -p tcp --dport 5060 -j DROP 2>/dev/null || iptables -A INPUT -p tcp --dport 5060 -j DROP
command -v netfilter-persistent >/dev/null && netfilter-persistent save || \
  { mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4; }

# --- 5. start it -------------------------------------------------------
echo "==> starting asterisk"
systemctl enable asterisk >/dev/null 2>&1 || true
systemctl restart asterisk
sleep 4

echo
echo "================= done ================="
asterisk -rx "core show version" | head -1
asterisk -rx "pjsip show registrations"
echo
echo "check:  asterisk -rx 'pjsip show contacts'     # softphone + trunk"
echo "logs:   journalctl -u asterisk -f"
echo "cli:    asterisk -rvvv"
