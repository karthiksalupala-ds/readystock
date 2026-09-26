from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import AskResult
from app.services.reasoner import Reasoner


class StubReasoner(Reasoner):
    def ask(self, graph, question: str) -> AskResult:  # type: ignore[no-untyped-def]
        chair_ids = [obj.id for obj in graph.objects if obj.type == "chair"]
        return AskResult(reply=f"stub:{question}", highlight_ids=chair_ids + ["ghost"])


def test_health() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ingest_reconstruct_ask_http_contract() -> None:
    client = TestClient(create_app(reasoner=StubReasoner()))

    ingested = client.post("/scene/ingest", json={})
    assert ingested.status_code == 200
    raw = ingested.json()
    assert raw["room"]["width"] == 6.4
    assert all(obj["type"] == "unknown" for obj in raw["objects"])

    reconstructed = client.post("/scene/reconstruct", json={"graph": raw})
    assert reconstructed.status_code == 200
    body = reconstructed.json()
    assert body["analysisSteps"]
    graph = body["graph"]
    assert any(obj["type"] == "table" for obj in graph["objects"])

    asked = client.post("/scene/ask", json={"graph": graph, "question": "Show me all the chairs."})
    assert asked.status_code == 200
    payload = asked.json()
    assert payload["reply"].startswith("stub:")
    assert "ghost" not in payload["highlightIds"]
    assert set(payload["highlightIds"]) == {obj["id"] for obj in graph["objects"] if obj["type"] == "chair"}


def test_ask_blank_question_is_400() -> None:
    client = TestClient(create_app())
    ingested = client.post("/scene/ingest", json={}).json()
    graph = client.post("/scene/reconstruct", json={"graph": ingested}).json()["graph"]
    response = client.post("/scene/ask", json={"graph": graph, "question": "  "})
    assert response.status_code == 400


def test_ask_http_heuristic_highlights_existing_ids() -> None:
    client = TestClient(create_app())
    ingested = client.post("/scene/ingest", json={}).json()
    graph = client.post("/scene/reconstruct", json={"graph": ingested}).json()["graph"]
    response = client.post("/scene/ask", json={"graph": graph, "question": "Show me all the chairs."})
    assert response.status_code == 200
    payload = response.json()
    assert set(payload["highlightIds"]) == {obj["id"] for obj in graph["objects"] if obj["type"] == "chair"}
    assert "chair" in payload["reply"].lower()


def test_cors_allows_vite_origin() -> None:
    client = TestClient(create_app())
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_placeholder_openai_key_uses_heuristic(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("OPENAI_API_KEY", "sk-your-openai-api-key")
    from app.services.reasoner import HeuristicReasoner, build_reasoner

    assert isinstance(build_reasoner(), HeuristicReasoner)
