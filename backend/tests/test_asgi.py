from __future__ import annotations

from fastapi.testclient import TestClient

from app.asgi import strip_path_prefix
from app.main import create_app
from app.services.reasoner import HeuristicReasoner

PREFIX = "/api/index"


def client() -> TestClient:
    return TestClient(strip_path_prefix(create_app(reasoner=HeuristicReasoner()), PREFIX))


def test_serves_the_app_when_the_platform_passes_the_original_path():
    assert client().get("/health").json() == {"status": "ok"}


def test_serves_the_app_when_the_platform_passes_the_function_path():
    # Some hosts rewrite to the function's own route and keep the rest of the path.
    assert client().get(f"{PREFIX}/health").json() == {"status": "ok"}


def test_maps_the_bare_function_path_to_the_root():
    # Not a route this app serves, but it must be a 404 from the app, not a crash.
    assert client().get(PREFIX).status_code == 404


def test_keeps_bodies_intact_through_the_prefix():
    direct = client().post("/scene/ingest", json={})
    prefixed = client().post(f"{PREFIX}/scene/ingest", json={})

    assert direct.status_code == 200
    assert prefixed.status_code == 200
    assert prefixed.json() == direct.json()
    assert len(prefixed.json()["objects"]) == 53


def test_does_not_strip_a_path_that_merely_starts_with_the_same_letters():
    # "/api/indexing/health" shares a prefix with "/api/index" but is not under it.
    assert client().get("/api/indexing/health").status_code == 404


def test_leaves_non_http_scopes_alone():
    seen: list[dict] = []

    async def inner(scope, receive, send):
        seen.append(scope)

    wrapped = strip_path_prefix(inner, PREFIX)
    scope = {"type": "lifespan", "path": f"{PREFIX}/whatever"}

    import asyncio

    asyncio.run(wrapped(scope, None, None))

    assert seen == [scope]
