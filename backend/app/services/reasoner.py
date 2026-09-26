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


def build_reasoner() -> Reasoner:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    base_url = os.getenv("OPENAI_BASE_URL", "").strip() or None
    if key.startswith("sk-") and "your-openai-api-key" not in key:
        return OpenAIReasoner(api_key=key, model=model, base_url=base_url)
    return HeuristicReasoner()
