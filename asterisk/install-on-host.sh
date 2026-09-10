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
: "${PBX_AMI_USER:=tolkyn-bridge}"
: "${PBX_AMI_PASSWORD:=}"
: "${PBX_EVENT_BACKEND_URL:=http://127.0.0.1:8090/api/v1}"
: "${PBX_EVENT_WORKSPACE_ID:=_default}"
: "${PBX_EVENT_WEBHOOK_SECRET:=}"
export CLOUDONE_SIP_HOST CLOUDONE_SIP_USER CLOUDONE_SIP_PASSWORD CLOUDONE_DID \
       PBX_PUBLIC_IP SOFTPHONE_EXT SOFTPHONE_EXT_PASSWORD PBX_WS_PORT \
       PBX_AMI_USER PBX_AMI_PASSWORD PBX_EVENT_BACKEND_URL PBX_EVENT_WORKSPACE_ID \
       PBX_EVENT_WEBHOOK_SECRET

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
SUBST='${CLOUDONE_SIP_HOST} ${CLOUDONE_SIP_USER} ${CLOUDONE_SIP_PASSWORD} ${CLOUDONE_DID} ${PBX_PUBLIC_IP} ${SOFTPHONE_EXT} ${SOFTPHONE_EXT_PASSWORD} ${PBX_WS_PORT} ${PBX_AMI_USER} ${PBX_AMI_PASSWORD}'
for f in "$TPL"/*.template; do
  name="$(basename "$f" .template)"
  # manager.conf is handled in step 4c (only when AMI creds are set)
  [ "$name" = "manager.conf" ] && continue
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

# --- 4b. coturn: the media relay -------------------------------------
# Asterisk's bundled ICE can't negotiate a direct WebRTC media path on this box
# — the host carries ~12 Docker bridge interfaces (other projects) and
# pjproject's connectivity checks die on them ("Error sending STUN request:
# Invalid argument"). Fix: run a TURN relay bound to ONLY the public IP and
# force every call's audio through it (frontend sets iceTransportPolicy:relay).
# One clean path, no interface guessing.
if [ -n "${PBX_TURN_PASSWORD:-}" ]; then
  echo "==> installing + configuring coturn (media relay on ${PBX_PUBLIC_IP})"
  ( cd "$ROOT" && docker-compose stop coturn 2>/dev/null ) || true
  command -v turnserver >/dev/null || apt-get install -y --no-install-recommends coturn
  : "${PBX_TURN_USER:=tolkyn}"
  TURN_MIN=49152 TURN_MAX=49200
  cat > /etc/turnserver.conf <<EOF
# rendered by asterisk/install-on-host.sh — do not hand-edit
listening-port=3478
# bind the public IP only: never enumerate the Docker bridge interfaces
listening-ip=${PBX_PUBLIC_IP}
relay-ip=${PBX_PUBLIC_IP}
external-ip=${PBX_PUBLIC_IP}
min-port=${TURN_MIN}
max-port=${TURN_MAX}
realm=tolkyn
lt-cred-mech
user=${PBX_TURN_USER}:${PBX_TURN_PASSWORD}
no-tls
no-dtls
no-cli
no-software-attribute
no-multicast-peers
# this VPS hosts other projects — never let the relay reach internal ranges
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
# the only peer the browser ever needs to reach is Asterisk, on the public IP
allowed-peer-ip=${PBX_PUBLIC_IP}
EOF
  chmod 640 /etc/turnserver.conf
  echo "TURNSERVER_ENABLED=1" > /etc/default/coturn
  # coturn is browser-facing — open to the world (agents connect from anywhere)
  iptables -C INPUT -p udp --dport 3478 -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport 3478 -j ACCEPT
  iptables -C INPUT -p tcp --dport 3478 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 3478 -j ACCEPT
  iptables -C INPUT -p udp --dport ${TURN_MIN}:${TURN_MAX} -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p udp --dport ${TURN_MIN}:${TURN_MAX} -j ACCEPT
  systemctl enable coturn >/dev/null 2>&1 || true
  systemctl restart coturn
else
  echo "==> PBX_TURN_PASSWORD not set — skipping coturn (call audio will not work)"
fi

# --- 4c. AMI event bridge: real call state in the Call Center ---------
# A tiny host service reads Asterisk's manager socket and POSTs
# ring/answered/hangup to the backend, so the active-call card clears when
# the far end hangs up and talk-time / missed calls are recorded.
if [ -n "${PBX_AMI_PASSWORD:-}" ] && [ -n "${PBX_EVENT_WEBHOOK_SECRET:-}" ]; then
  echo "==> configuring AMI + the call-event bridge"
  envsubst '${PBX_AMI_USER} ${PBX_AMI_PASSWORD}' < "$TPL/manager.conf.template" > /etc/asterisk/manager.conf
  chown asterisk:asterisk /etc/asterisk/manager.conf
  chmod 640 /etc/asterisk/manager.conf

  install -d -o asterisk -g asterisk /opt/tolkyn
  install -m 0644 -o asterisk -g asterisk "$HERE/ami-bridge.py" /opt/tolkyn/ami-bridge.py

  install -d /etc/tolkyn
  umask 077
  cat > /etc/tolkyn/ami-bridge.env <<EOF
PBX_AMI_HOST=127.0.0.1
PBX_AMI_PORT=5038
PBX_AMI_USER=${PBX_AMI_USER}
PBX_AMI_PASSWORD=${PBX_AMI_PASSWORD}
PBX_EVENT_BACKEND_URL=${PBX_EVENT_BACKEND_URL}
PBX_EVENT_WORKSPACE_ID=${PBX_EVENT_WORKSPACE_ID}
PBX_EVENT_WEBHOOK_SECRET=${PBX_EVENT_WEBHOOK_SECRET}
SOFTPHONE_EXT=${SOFTPHONE_EXT}
EOF
  umask 022
  chown root:asterisk /etc/tolkyn/ami-bridge.env
  chmod 640 /etc/tolkyn/ami-bridge.env

  install -m 0644 "$HERE/tolkyn-ami-bridge.service" /etc/systemd/system/tolkyn-ami-bridge.service
  systemctl daemon-reload
  systemctl enable tolkyn-ami-bridge >/dev/null 2>&1 || true
else
  echo "==> PBX_AMI_PASSWORD / PBX_EVENT_WEBHOOK_SECRET not set — skipping the call-event bridge"
  # make sure a half-configured AMI isn't left enabled
  [ -f /etc/asterisk/manager.conf ] && sed -i 's/^enabled = yes/enabled = no/' /etc/asterisk/manager.conf || true
fi

command -v netfilter-persistent >/dev/null && netfilter-persistent save || \
  { mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4; }

# --- 5. start it -------------------------------------------------------
echo "==> starting asterisk"
systemctl enable asterisk >/dev/null 2>&1 || true
systemctl restart asterisk
sleep 4

if [ -n "${PBX_AMI_PASSWORD:-}" ] && [ -n "${PBX_EVENT_WEBHOOK_SECRET:-}" ]; then
  echo "==> starting the call-event bridge"
  systemctl restart tolkyn-ami-bridge || true
fi

echo
echo "================= done ================="
asterisk -rx "core show version" | head -1
asterisk -rx "pjsip show registrations"
if [ -n "${PBX_TURN_PASSWORD:-}" ]; then
  echo
  systemctl is-active --quiet coturn && echo "coturn: active on ${PBX_PUBLIC_IP}:3478" || echo "coturn: NOT running — check: journalctl -u coturn -n40"
fi
if [ -n "${PBX_AMI_PASSWORD:-}" ] && [ -n "${PBX_EVENT_WEBHOOK_SECRET:-}" ]; then
  systemctl is-active --quiet tolkyn-ami-bridge \
    && echo "ami-bridge: active — journalctl -u tolkyn-ami-bridge -f" \
    || echo "ami-bridge: NOT running — check: journalctl -u tolkyn-ami-bridge -n40"
fi
echo
echo "check:  asterisk -rx 'pjsip show contacts'     # softphone + trunk"
echo "logs:   journalctl -u asterisk -f"
echo "cli:    asterisk -rvvv"
