from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import AskResult
from app.services.reasoner import Reasoner
from app.services.inventory import load_demo_inventory


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


def test_provider_defaults_to_openrouter_with_ollama_backup(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    from app.services.reasoner import OllamaReasoner, OpenAIReasoner, build_reasoner

    reasoner = build_reasoner()
    assert isinstance(reasoner, OpenAIReasoner)
    assert isinstance(reasoner._fallback, OllamaReasoner)


def test_ollama_provider_can_be_selected_directly(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    from app.services.reasoner import OllamaReasoner, build_reasoner

    reasoner = build_reasoner()
    assert isinstance(reasoner, OllamaReasoner)


def test_openrouter_provider_requires_a_key(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    from app.services.reasoner import OllamaReasoner, build_reasoner

    assert isinstance(build_reasoner(), OllamaReasoner)


def test_configured_inventory_path_resolves_from_repository_root(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("DEMO_INVENTORY_PATH", "backend/app/demo_inventory.json")

    inventory = load_demo_inventory()

    assert inventory[0]["name"] == "Rice 5kg"


def test_heuristic_provider_is_explicit_offline_fallback(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("LLM_PROVIDER", "heuristic")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-your-openai-api-key")
    from app.services.reasoner import HeuristicReasoner, build_reasoner

    assert isinstance(build_reasoner(), HeuristicReasoner)


def test_placement_advisor_is_response_only_and_returns_shelf_targets() -> None:
    client = TestClient(create_app())
    graph = client.post("/scene/ingest", json={}).json()
    graph = client.post("/scene/reconstruct", json={"graph": graph}).json()["graph"]
    response = client.post(
        "/advisor/placement",
        json={"graph": graph, "item": "Rice Bags", "quantity": 4},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["recommendations"]
    assert payload["recommendations"][0]["objectId"] == "rice-shelf"
    assert "recommendations" not in graph


def test_mock_shelf_vision_accepts_multipart_without_image_dependencies() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/vision/analyze-shelf",
        files={"image": ("shelf.jpg", b"not-an-image", "image/jpeg")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "mock"
    assert len(payload["detections"]) == 3
