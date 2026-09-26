"""ASGI plumbing for hosts that route a request through a function's own path.

A serverless platform picks the function by file route (`api/index.py`) and then
rewrites the request to it. Some pass the original path through untouched, some
prepend the function's route. This repo cannot verify which without deploying,
so the entrypoint accepts both and the behaviour is pinned by tests instead.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable

Scope = dict[str, Any]
ASGIApp = Callable[[Scope, Any, Any], Awaitable[None]]


def strip_path_prefix(app: ASGIApp, prefix: str) -> ASGIApp:
    """Serve `app` whether or not the host routed the request through `prefix`.

    Only whole path segments count: `/api/indexing` is not under `/api/index`.
    """
    prefix = prefix.rstrip("/")

    async def wrapped(scope: Scope, receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or not prefix:
            await app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path != prefix and not path.startswith(prefix + "/"):
            await app(scope, receive, send)
            return

        scope = dict(scope)
        scope["path"] = path[len(prefix) :] or "/"

        raw_path = scope.get("raw_path")
        if isinstance(raw_path, bytes):
            encoded = prefix.encode()
            if raw_path == encoded or raw_path.startswith(encoded + b"/"):
                scope["raw_path"] = raw_path[len(encoded) :] or b"/"

        await app(scope, receive, send)

    return wrapped
