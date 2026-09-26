from __future__ import annotations

import json
import logging
import os
from collections.abc import Sequence

from app.models import AskResult, SceneGraph
from app.services.inventory import load_demo_inventory

logger = logging.getLogger(__name__)


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
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str | None = None,
        fallback: Reasoner | None = None,
    ) -> None:
        from openai import OpenAI

        self.model = model
        self._client = OpenAI(api_key=api_key, base_url=base_url or None)
        self._fallback = fallback

    def ask(self, graph: SceneGraph, question: str) -> AskResult:
        try:
            completion = self._client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.4,
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
                        "content": build_prompt(graph, question),
                    },
                ],
            )
            content = completion.choices[0].message.content or "{}"
            data = json.loads(content)
            if not isinstance(data, dict) or not str(data.get("reply", "")).strip():
                raise ValueError("OpenRouter response did not contain a usable reply")
            ids = data.get("highlightIds") or data.get("highlight_ids") or []
            if not isinstance(ids, list):
                ids = []
            return AskResult(reply=str(data.get("reply", "")), highlight_ids=[str(item) for item in ids])
        except Exception as exc:
            logger.warning("Cloud LLM request failed: %s", exc)
            if self._fallback is not None:
                return self._fallback.ask(graph, question)
            from app.services.ask import heuristic_ask

            return heuristic_ask(graph, question)


class OllamaReasoner(Reasoner):
    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "qwen2.5:1.5b",
        fallback: Reasoner | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._fallback = fallback

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
                    "options": {"temperature": 0.4},
                },
                timeout=30,
            )
            response.raise_for_status()
            response_payload = response.json()
            raw_result = response_payload.get("response", "")
            if not isinstance(raw_result, str) or not raw_result.strip():
                raise ValueError("Ollama response did not contain a JSON response string")
            data = json.loads(raw_result)
            if not isinstance(data, dict) or not str(data.get("reply", "")).strip():
                raise ValueError("Ollama response did not contain a usable reply")
            ids = data.get("highlightIds", data.get("highlight_ids", []))
            return AskResult(reply=str(data.get("reply", "")), highlight_ids=[str(item) for item in ids] if isinstance(ids, list) else [])
        except Exception as exc:
            logger.warning("Ollama request failed: %s", exc)
            if self._fallback is not None:
                return self._fallback.ask(graph, question)
            from app.services.ask import heuristic_ask

            return heuristic_ask(graph, question)


def build_prompt(graph: SceneGraph, question: str) -> str:
    inventory = load_demo_inventory()
    inventory_lines = []
    for item in inventory:
        status = "CRITICAL" if item["current_stock"] <= item["reorder_point"] // 2 else (
            "WARNING" if item["current_stock"] <= item["reorder_point"] else "HEALTHY"
        )
        inventory_lines.append(
            f'- {item["name"]}: {item["current_stock"]} units, {status}; '
            f'{item["daily_sales"]} sold/day; {item["margin_percent"]}% margin; '
            f'supplier {item["supplier"]}; reorder point {item["reorder_point"]}; '
            f'reorder quantity {item["reorder_quantity"]}; shelf id {item["shelf_id"]}'
        )
    return (
        "You are ReadyStock AI, an offline grocery-store shop-owner assistant. "
        "Use the current inventory and scene graph as authoritative data. "
        "Answer the user's specific question, not a generic description. Return valid JSON with exactly "
        'two fields: "reply" (short natural-language answer) and "highlightIds" '
        "(an array containing only matching object ids from the scene graph). "
        f"Question: {question}\n"
        "Current kirana store inventory:\n"
        + "\n".join(inventory_lines)
        + "\nCurrent scene graph:\n"
        f"Scene graph: {json.dumps(graph.model_dump(by_alias=True))}"
    )


def build_reasoner() -> Reasoner:
    provider = os.getenv("LLM_PROVIDER", "openrouter").strip().lower()
    if provider == "heuristic":
        return HeuristicReasoner()
    ollama = OllamaReasoner(
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip() or "http://localhost:11434",
        model=os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b").strip() or "qwen2.5:1.5b",
    )
    if provider == "ollama":
        return ollama
    if provider == "openrouter":
        openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
        if not openrouter_key:
            logger.warning("OPENROUTER_API_KEY is not configured; using Ollama")
            return ollama
        return OpenAIReasoner(
            api_key=openrouter_key,
            model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini").strip() or "openai/gpt-4o-mini",
            base_url="https://openrouter.ai/api/v1",
            fallback=ollama,
        )
    if provider == "ollama-backup":
        return OllamaReasoner(
            base_url=ollama.base_url,
            model=ollama.model,
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
