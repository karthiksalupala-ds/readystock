"""Vercel serverless entrypoint.

Vercel selects this file by its route (`/api/index`) and serves the ASGI app it
exports. `vercel.json` rewrites `/scene/*` and `/health` here, so the browser
still talks to the same paths the Vite dev proxy serves locally and the client
needs no build-time API base URL.

The path wrapper is there because the platform may or may not prepend the
function's own route; `backend/tests/test_asgi.py` pins both cases.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.asgi import strip_path_prefix  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402

app = strip_path_prefix(fastapi_app, "/api/index")
