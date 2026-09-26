from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models import AskRequest, IngestRequest, ReconstructRequest
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

    return app


app = create_app()
