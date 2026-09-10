# coturn — TURN relay for the call centre

WebRTC media between an agent's browser (often behind carrier-grade NAT) and
the Asterisk PBX frequently can't establish a direct path — the call connects
but is silent. coturn runs on the VPS public IP and relays the audio for both
ends, so it always works.

Runs with `network_mode: host` — it needs the public IP directly for the
relay candidates it hands out.

## Config (all via `docker-compose.yml` command flags, from the root `.env`)

| var | example |
|-----|---------|
| `PBX_PUBLIC_IP` | `38.242.200.152` |
| `PBX_TURN_USER` | `tolkyn` |
| `PBX_TURN_PASSWORD` | *(generate: `openssl rand -hex 20`)* |

The same three feed the backend (`PBX_TURN_URL=turn:<ip>:3478`, `PBX_TURN_USER`,
`PBX_TURN_PASSWORD`) so `GET /call-center/softphone` can hand the browser the
TURN credentials, and Asterisk's `rtp.conf` (`turnaddr` / `turnusername` /
`turnpassword`).

## Ports
- `3478/udp` + `3478/tcp` — TURN control
- `49152-49252/udp` — relay range (50 concurrent call legs; plenty for now)

No firewall changes needed on this VPS (no ufw / cloud firewall).

## Check it
```bash
docker-compose logs coturn | tail
# a quick allocate test from anywhere:
#   npx @nodert/turn-tester turn:38.242.200.152:3478 tolkyn <password>
```
