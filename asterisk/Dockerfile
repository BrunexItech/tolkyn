# Asterisk 20 LTS — Tolkyn's PBX for the Cloud One SIP trunk. Ubuntu 24.04
# ships Asterisk 20.6 in universe (Debian bookworm dropped the package).
# Runs with `network_mode: host` (see docker-compose.yml): SIP, RTP and the
# WebSocket all bind straight to the host, which is the only reliable way to
# carry RTP audio without Docker NAT mangling it.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        asterisk gettext-base ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /usr/share/asterisk/moh /var/lib/asterisk/moh

# our config templates; the entrypoint renders the *.template files with the
# runtime env vars and drops the rest in place
COPY etc/ /opt/asterisk-templates/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
