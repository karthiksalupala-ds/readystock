from __future__ import annotations

from app.models import AskResult, SceneGraph, SceneObject
from app.services.reasoner import Reasoner, valid_highlight_ids


def ask_scene(graph: SceneGraph, question: str, reasoner: Reasoner | None = None) -> AskResult:
    if not question.strip():
        raise ValueError("question is required")
    if reasoner is not None:
        result = reasoner.ask(graph, question)
        return AskResult(reply=result.reply, highlight_ids=valid_highlight_ids(graph, result.highlight_ids))
    return heuristic_ask(graph, question)


def heuristic_ask(graph: SceneGraph, question: str) -> AskResult:
    q = question.lower()
    critical = [obj for obj in graph.objects if obj.color == "#ef4444"]
    chairs = _of_type(graph, "chair")
    tables = _of_type(graph, "table")
    equipment = [obj for obj in graph.objects if obj.category == "equipment"]
    doors = _of_type(graph, "door")
    windows = _of_type(graph, "window")
    obstructors = [obj for obj in graph.objects if obj.category == "furniture" and obj.type != "rug"]
    room = graph.room

    if "rice" in q:
        return AskResult(
            reply="Rice Bags are critical at 3 units. Reorder 9 units to reach the reorder point.",
            highlight_ids=[obj.id for obj in graph.objects if obj.id == "rice-shelf"],
        )
    if "oil" in q:
        return AskResult(
            reply="Cooking Oil is healthy at 18 units. Highlighting the oil shelf.",
            highlight_ids=[obj.id for obj in graph.objects if obj.id == "oil-shelf"],
        )
    if "dal" in q:
        return AskResult(
            reply="Toor Dal is at warning stock with 6 units. Highlighting the dal shelf.",
            highlight_ids=[obj.id for obj in graph.objects if obj.id == "dal-shelf"],
        )
    if "soap" in q:
        return AskResult(
            reply="Soap Packets are at warning stock with 5 units. Highlighting the soap shelf.",
            highlight_ids=[obj.id for obj in graph.objects if obj.id == "soap-shelf"],
        )
    if "critical" in q or "reorder" in q:
        names = ", ".join(obj.label for obj in critical) or "none"
        return AskResult(
            reply=f"Critical stock items: {names}. Reorder these items soon.",
            highlight_ids=[obj.id for obj in critical],
        )
    if "chair" in q:
        return AskResult(
            reply=f"{len(chairs)} chairs in the current layout. Highlighting them in the scene.",
            highlight_ids=[obj.id for obj in chairs],
        )
    if "table" in q:
        return AskResult(
            reply=f"{len(tables)} tables in the current layout. Highlighting them now.",
            highlight_ids=[obj.id for obj in tables],
        )
    if "door" in q or "exit" in q:
        return AskResult(
            reply="The door is on the far wall, offset to the right of center. Nearest exit highlighted.",
            highlight_ids=[obj.id for obj in doors],
        )
    if "window" in q:
        return AskResult(
            reply="One window spans the right wall. Highlighting the opening."
            if len(windows) == 1
            else f"{len(windows)} windows found. Highlighting them now.",
            highlight_ids=[obj.id for obj in windows],
        )
    if any(word in q for word in ("electronic", "equipment", "monitor", "display")):
        return AskResult(
            reply=f"{len(equipment)} electronic objects in the current layout.",
            highlight_ids=[obj.id for obj in equipment],
        )
    if any(word in q for word in ("obstruct", "walkway", "movement", "block")):
        return AskResult(
            reply=f"Highlighting {len(obstructors)} furniture items to review for walking clearance.",
            highlight_ids=[obj.id for obj in obstructors],
        )
    matched = [obj for obj in graph.objects if obj.type != "object" and (obj.type in q or obj.label.lower() in q)]
    if matched:
        return AskResult(reply=f"Found {len(matched)} matching objects in the current layout.",
                         highlight_ids=[obj.id for obj in matched])
    return AskResult(
        reply=(
            f"This {room.name} is {room.width}m × {room.depth}m. "
            f"I found {len(graph.objects)} labelled objects. Try asking about chairs, the door, or obstacles."
        ),
        highlight_ids=[],
    )


def _of_type(graph: SceneGraph, type_name: str) -> list[SceneObject]:
    return [obj for obj in graph.objects if obj.type == type_name]
