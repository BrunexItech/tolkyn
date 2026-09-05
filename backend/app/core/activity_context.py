"""Lets a service attach a precise, human-meaningful action name (and
optional structured detail) to the ActivityLog row the request-logging
middleware is already about to write — without threading a Request object
through every service method's signature.

Implementation note: a ContextVar `.set()` called from inside a route handler
does NOT propagate back to BaseHTTPMiddleware.dispatch() after call_next()
returns, because Starlette runs the downstream app in a separately spawned
task — a fresh `.set()` only rebinds that child task's own copy of the
context, invisible to the parent once the child finishes. The fix used here:
the middleware opens a mutable dict and binds *that object* into the
ContextVar before dispatching; note_activity() then mutates the same dict in
place. Object mutation is visible across the task boundary because both
tasks hold a reference to the same dict — a `.set()` never crosses it.
"""
import contextvars
from typing import Any, Optional

_bucket: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar("_activity_bucket", default=None)


def open_bucket() -> dict:
    bucket: dict = {}
    _bucket.set(bucket)
    return bucket


def note_activity(action: str, **detail: Any) -> None:
    """Call from inside a service method to label the current request's
    ActivityLog row with a precise action name instead of the generic
    URL-derived one, e.g.
    note_activity("team.role_change", member_id=m.id, from_role="editor", to_role="admin")
    A no-op outside a request (e.g. a background scheduler sweep) since no
    bucket is open there — the caller doesn't need to know or care.

    First call wins the `action` label. A handler can call this more than
    once per request (e.g. PostService.approve() calls note_activity for the
    approval itself, then internally reuses _publish(), which calls it again
    for the publish) — the outermost, caller-facing event is what the reader
    actually wants to see, not whatever happened to run last, so later calls
    only append to `detail` instead of overwriting `action`."""
    bucket = _bucket.get()
    if bucket is None:
        return
    if "action" not in bucket:
        bucket["action"] = action[:120]
        if detail:
            bucket["detail"] = detail
    elif detail:
        bucket.setdefault("detail", {})[action[:120]] = detail
