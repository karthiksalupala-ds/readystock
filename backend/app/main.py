from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.models import AskRequest, IngestRequest, PlacementRequest, ReconstructRequest
from app.services.advisor import advise_placement
from app.services.vision import analyze_shelf
from app.services.ask import ask_scene
from app.services.ingest import ingest_capture
from app.services.reconstruct import reconstruct_scene
from app.services.reasoner import Reasoner, build_reasoner

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


def create_app(reasoner: Reasoner | None = None) -> FastAPI:
    assistant = reasoner or build_reasoner()
    app = FastAPI(title="InteLiDar", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/scene/ingest")
    def ingest(body: IngestRequest | None = None):
        return ingest_capture(body or IngestRequest())

    @app.post("/scene/reconstruct")
    def reconstruct(body: ReconstructRequest):
        return reconstruct_scene(body.graph)

    @app.post("/scene/ask")
    def ask(body: AskRequest):
        try:
            return ask_scene(body.graph, body.question, reasoner=assistant)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/advisor/placement")
    def placement(body: PlacementRequest):
        return advise_placement(body)

    @app.post("/vision/analyze-shelf")
    async def analyze_shelf_image(request: Request):
        # Read the body so this accepts a real multipart upload without adding
        # python-multipart; the MVP intentionally does not inspect image bytes.
        body = await request.body()
        content_type = request.headers.get("content-type", "")
        filename = None
        if "filename=" in content_type:
            filename = content_type.split("filename=", 1)[1].split(";", 1)[0].strip('" ')
        if not body:
            raise HTTPException(status_code=400, detail="image is required")
        return analyze_shelf(filename)

    return app


app = create_app()
