# Tolkyn PBX (Asterisk)

Asterisk 20 acting as the PBX between the **Cloud One SIP trunk** and Tolkyn's
in-browser softphone (SIP.js / WebRTC).

```
Cloud One  ──SIP/UDP 5060──►  Asterisk (host network)  ◄──WSS /ws──  browser softphone
  trunk        RTP 10000-20000        │                    (via nginx: pbx.tolkyn.co.ke)
                                      └─ dialplan: inbound DID → agent → voicemail
                                                   outbound → normalise → trunk (caller ID = DID)
```

## Runs natively on the host (not Docker)
`sudo bash asterisk/install-on-host.sh` from the repo root. RTP audio is UDP and
does not survive Docker's bridge NAT cleanly, and Asterisk's bundled ICE trips
over the host's many Docker bridge interfaces ("Error sending STUN request:
Invalid argument"). Native install: Asterisk binds the real interface,
`external_media_address` = the VPS public IP.

## Call audio goes through coturn (relay-only)
The same install script also installs **coturn**, bound to the public IP only,
and the browser softphone is forced to `iceTransportPolicy: "relay"`. Every
call's audio therefore takes one deterministic path
(browser → coturn:3478 → Asterisk) instead of asking Asterisk's ICE to choose
among ~12 interfaces. Needs `PBX_TURN_*` set in `.env`. coturn ports
(3478 + 49152-49200/udp) are opened to the world by the script.

## Config
Templates in `etc/` are rendered by `entrypoint.sh` using these env vars
(set in the root `.env`, passed through `docker-compose.yml`):

| var | example |
|-----|---------|
| `CLOUDONE_SIP_HOST` | `LS02.CLOUDONE.CO.KE` |
| `CLOUDONE_SIP_USER` | `ittqaniyun_poc` |
| `CLOUDONE_SIP_PASSWORD` | *(from Cloud One WhatsApp)* |
| `CLOUDONE_DID` | `254207901958` |
| `PBX_PUBLIC_IP` | `38.242.200.152` |
| `SOFTPHONE_EXT` | `1001` |
| `SOFTPHONE_EXT_PASSWORD` | *(generate: `openssl rand -hex 16`)* |
| `PBX_WS_PORT` | `8188` |

## Handy commands
```bash
docker-compose logs -f asterisk
docker-compose exec asterisk asterisk -rx "pjsip show registrations"   # trunk online?
docker-compose exec asterisk asterisk -rx "pjsip show endpoints"
docker-compose exec asterisk asterisk -rx "pjsip show contacts"        # softphone registered?
docker-compose exec asterisk asterisk -rx "dialplan show from-internal"
```

## Live call state — the AMI bridge
`ami-bridge.py` (host systemd service `tolkyn-ami-bridge`, installed by
`install-on-host.sh`) reads Asterisk's Manager socket (`manager.conf`, localhost
only) and POSTs `ring` / `dialing` / `answered` / `hangup` to the backend
webhook (`POST /call-center/webhook/<ws>/event`, signed with
`PBX_EVENT_WEBHOOK_SECRET`). That's what makes the Call Center's active-call
card clear when the far end hangs up, starts the talk timer only on answer, and
records missed calls. Pure observation — no dialplan changes.

```bash
journalctl -u tolkyn-ami-bridge -f
sudo asterisk -rx "manager show connected"
```

The browser softphone also self-reports its SIP lifecycle
(`POST /call-center/softphone/event`) so the UI stays correct even if the bridge
is down while the agent's tab is open.

## Multi-tenant: one trunk, many DIDs, many workspaces
One Cloud One trunk serves every workspace. Adding a client is entirely a
super-admin action (Telephony page): assign them a **DID** from the pool
(`CLOUDONE_DID_POOL` in the backend `.env` — a workspace can never be handed
a DID another workspace already holds, enforced by a DB unique index, not
just the UI) and a **SIP extension + password**. Nothing to touch on the PBX
itself.

`sync_workspaces.py` (host systemd timer `tolkyn-sync-workspaces`, every 30s)
is what makes that true: it pulls the current DID/extension/workspace table
from the backend (`GET /call-center/pbx-routing`, secret-protected) and
- (re)writes `pjsip_workspaces.conf` — one endpoint/aor/auth block per agent
  extension, `#include`d from `pjsip.conf` — then `pjsip reload`s only if it
  changed;
- (re)writes `voicemail_workspaces.conf` the same way, `#include`d from
  `voicemail.conf`;
- keeps Asterisk's built-in AstDB (family `tolkyn`) current: `did/<last 9
  digits>` → extension, `ext_did/<ext>` → DID, `ext_ws/<ext>` → workspace_id.

`extensions.conf.template`'s dialplan never hardcodes a DID or extension — it
looks up `${DB(tolkyn/did/...)}` at call time, so onboarding a new client
never touches the dialplan. An unmapped DID is hung up, never guessed at
(same principle in the AMI bridge and voicemail-notify.sh: an event that
can't be resolved to exactly one workspace is dropped and logged, not
attributed to the wrong client).

```bash
journalctl -u tolkyn-sync-workspaces -f
sudo asterisk -rx "database show tolkyn"     # the live routing table
sudo asterisk -rx "pjsip show endpoints"     # every provisioned agent line
sudo systemctl start tolkyn-sync-workspaces.service   # force a sync now
```

One escape hatch: `PBX_EVENT_WORKSPACE_ID` / `SOFTPHONE_EXT` in `.env` are
kept as a legacy single-tenant fallback, used only for as long as the routing
table is completely empty (nobody has been assigned a DID yet through super
admin). The moment even one workspace is configured, an unresolved call is
dropped rather than silently attributed to that fallback workspace.
