from __future__ import annotations

import json
import os
from collections.abc import Sequence

from app.models import AskResult, SceneGraph


class Reasoner:
    def ask(self, graph: SceneGraph, question: str) -> AskResult:
        raise NotImplementedError


def valid_highlight_ids(graph: SceneGraph, ids: Sequence[str]) -> list[str]:
    known = {obj.id for obj in graph.objects}
    return [item for item in ids if item in known]


class HeuristicReasoner(Reasoner):
    def ask(self, graph: SceneGraph, question: str) -> AskResult:
        from app.services.ask import heuristic_ask

        return heuristic_ask(graph, question)


class OpenAIReasoner(Reasoner):
    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        from openai import OpenAI

        self.model = model
        self._client = OpenAI(api_key=api_key, base_url=base_url or None)

    def ask(self, graph: SceneGraph, question: str) -> AskResult:
        try:
            payload = graph.model_dump(by_alias=True)
            completion = self._client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are InteLiDar's spatial assistant. "
                            "Use only the supplied semantic scene graph. "
                            'Return JSON: {"reply": string, "highlightIds": string[]}. '
                            "highlightIds must be object ids from the graph. Never invent ids."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps({"question": question, "graph": payload}),
                    },
                ],
            )
            content = completion.choices[0].message.content or "{}"
            data = json.loads(content)
            ids = data.get("highlightIds") or data.get("highlight_ids") or []
            if not isinstance(ids, list):
                ids = []
            return AskResult(reply=str(data.get("reply", "")), highlight_ids=[str(item) for item in ids])
        except Exception:
            from app.services.ask import heuristic_ask

            return heuristic_ask(graph, question)


class OllamaReasoner(Reasoner):
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen2.5:1.5b") -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    def ask(self, graph: SceneGraph, question: str) -> AskResult:
        try:
            import httpx

            response = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "stream": False,
                    "prompt": build_prompt(graph, question),
                    "format": "json",
                },
                timeout=30,
            )
            response.raise_for_status()
            data = json.loads(response.json().get("response", "{}"))
            ids = data.get("highlightIds", data.get("highlight_ids", []))
            return AskResult(reply=str(data.get("reply", "")), highlight_ids=[str(item) for item in ids] if isinstance(ids, list) else [])
        except Exception:
            from app.services.ask import heuristic_ask

            return heuristic_ask(graph, question)


def build_prompt(graph: SceneGraph, question: str) -> str:
    return (
        "You are ReadyStock AI, an offline grocery-store spatial assistant. "
        "Answer only from the supplied scene graph. Return valid JSON with exactly "
        'two fields: "reply" (short natural-language answer) and "highlightIds" '
        "(an array containing only matching object ids). "
        f"Question: {question}\n"
        f"Scene graph: {json.dumps(graph.model_dump(by_alias=True))}"
    )


def build_reasoner() -> Reasoner:
    provider = os.getenv("LLM_PROVIDER", "ollama").strip().lower()
    if provider == "heuristic":
        return HeuristicReasoner()
    if provider == "ollama":
        return OllamaReasoner(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip() or "http://localhost:11434",
            model=os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b").strip() or "qwen2.5:1.5b",
        )
    if provider not in {"cloud", "openai", "groq"}:
        return HeuristicReasoner()

    key = os.getenv("OPENAI_API_KEY", "").strip()
    if provider == "groq" or (provider == "cloud" and not key and os.getenv("GROQ_API_KEY", "").strip()):
        provider = "groq"
        key = os.getenv("GROQ_API_KEY", "").strip()
    model = os.getenv("LLM_MODEL", os.getenv("OPENAI_MODEL", "gpt-4o-mini")).strip() or "gpt-4o-mini"
    base_url = os.getenv("LLM_BASE_URL", os.getenv("OPENAI_BASE_URL", "")).strip() or None
    if provider == "groq":
        base_url = base_url or "https://api.groq.com/openai/v1"
        model = os.getenv("LLM_MODEL", "llama-3.1-8b-instant").strip() or "llama-3.1-8b-instant"
    if provider in {"cloud", "openai"} and key.startswith("sk-") and "your-openai-api-key" not in key:
        return OpenAIReasoner(api_key=key, model=model, base_url=base_url)
    if provider == "groq" and key:
        return OpenAIReasoner(api_key=key, model=model, base_url=base_url)
    return HeuristicReasoner()
