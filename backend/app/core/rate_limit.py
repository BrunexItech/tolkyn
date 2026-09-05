"""Per-IP rate limiting (slowapi/limits). Storage is Redis when reachable so
the limit is shared across every API replica/worker — a limit that only
lived in one process's memory would let an attacker just get routed to a
different worker and start over. Falls back to in-memory automatically if
Redis isn't configured, which is fine for local/single-instance dev.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def _storage_uri() -> str:
    """Real connectivity check, not just "is the package installed" — a
    docker-compose deployment always has the package; what varies is whether
    a Redis *server* is actually reachable yet (local dev without one, or a
    compose stack still starting up). Never let rate limiting itself take
    the API down — fall back to per-process memory on any failure."""
    try:
        import redis

        client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=0.3, socket_timeout=0.3)
        client.ping()
        return settings.REDIS_URL
    except Exception:  # noqa: BLE001 - any failure means "use memory instead"
        return "memory://"


limiter = Limiter(key_func=get_remote_address, storage_uri=_storage_uri(), default_limits=[settings.RATE_LIMIT_DEFAULT])
