"""Guards the background scheduler so only one process runs it at a time.

The scheduler is started in-process (app.main's lifespan) purely for a
single-instance/dev deployment's convenience — nothing else needs to run
separately. The moment you scale the API to more than one replica (which
you should, for real traffic — see DEPLOYMENT.md), every replica would
otherwise run its own copy of the same sweep: posts published twice, invite
emails sent twice, duplicate activity-log noise. This is a Redis `SET NX`
lock, renewed each sweep, so exactly one process — whichever grabs it first —
does the work; every other replica's sweep is a fast no-op.

Falls back to "just run it" when Redis isn't reachable, matching this app's
existing pattern (see app.core.rate_limit) of degrading gracefully rather
than failing outright for a single-instance/dev setup with no Redis at all.
"""
from __future__ import annotations

import uuid

from app.core.config import settings

_LOCK_KEY = "tolkyn:scheduler:leader"
_TOKEN = uuid.uuid4().hex  # identifies *this* process, so it only ever releases its own lock
_TTL_SECONDS = 90  # comfortably longer than one sweep interval; a dead leader's lock expires on its own


def _client():
    try:
        import redis

        c = redis.from_url(settings.REDIS_URL, socket_connect_timeout=0.3, socket_timeout=0.3)
        c.ping()
        return c
    except Exception:  # noqa: BLE001
        return None


async def try_acquire() -> bool:
    """True if this process should run this sweep — either because it holds
    (or just took) the leader lock, or because there's no Redis to arbitrate
    with (single-instance dev: always true)."""
    client = _client()
    if client is None:
        return True
    try:
        # NX: only set if no other replica currently holds it. XX+GET below
        # extends *our own* hold without letting a different replica steal it
        # mid-sweep.
        got = client.set(_LOCK_KEY, _TOKEN, nx=True, ex=_TTL_SECONDS)
        if got:
            return True
        holder = client.get(_LOCK_KEY)
        return holder is not None and holder.decode() == _TOKEN
    except Exception:  # noqa: BLE001 - Redis hiccup shouldn't stall every replica's sweep
        return True


async def renew() -> None:
    client = _client()
    if client is None:
        return
    try:
        holder = client.get(_LOCK_KEY)
        if holder is not None and holder.decode() == _TOKEN:
            client.expire(_LOCK_KEY, _TTL_SECONDS)
    except Exception:  # noqa: BLE001
        pass
