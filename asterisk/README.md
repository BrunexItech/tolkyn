# Tolkyn PBX (Asterisk)

Asterisk 20 acting as the PBX between the **Cloud One SIP trunk** and Tolkyn's
in-browser softphone (SIP.js / WebRTC).

```
Cloud One  ──SIP/UDP 5060──►  Asterisk (host network)  ◄──WSS /ws──  browser softphone
  trunk        RTP 10000-20000        │                    (via nginx: pbx.tolkyn.co.ke)
                                      └─ dialplan: inbound DID → agent → voicemail
                                                   outbound → normalise → trunk (caller ID = DID)
```

## Why `network_mode: host`
RTP audio is UDP and does not survive Docker's bridge NAT cleanly (one-way
audio, dropped media). Host networking lets Asterisk bind the real interface,
so `external_media_address` = the VPS public IP is all the NAT handling needed.

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
