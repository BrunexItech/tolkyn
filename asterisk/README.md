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

## POC scope
One trunk, one extension (`1001`), one DID. Multi-tenant (per-workspace trunks,
DID→workspace routing, PJSIP realtime from the DB, ARI call control/CDR) is the
production phase — see `DEPLOYMENT.md`.
