from __future__ import annotations

import re

from app.models import AskResult, SceneGraph, SceneObject
from app.services.inventory import load_demo_inventory
from app.services.reasoner import Reasoner, valid_highlight_ids


def ask_scene(graph: SceneGraph, question: str, reasoner: Reasoner | None = None) -> AskResult:
    if not question.strip():
        raise ValueError("question is required")
    inventory_terms = (
        "stock", "sell", "selling", "sales", "restock", "reorder",
        "low inventory", "eye level", "placement",
    )
    if any(term in question.lower() for term in inventory_terms):
        return heuristic_ask(graph, question)
    if reasoner is not None:
        result = reasoner.ask(graph, question)
        return AskResult(reply=result.reply, highlight_ids=valid_highlight_ids(graph, result.highlight_ids))
    return heuristic_ask(graph, question)


def heuristic_ask(graph: SceneGraph, question: str) -> AskResult:
    q = question.lower()
    inventory = load_demo_inventory()
    critical = [obj for obj in graph.objects if obj.color == "#ef4444"]
    chairs = _of_type(graph, "chair")
    tables = _of_type(graph, "table")
    equipment = [obj for obj in graph.objects if obj.category == "equipment"]
    doors = _of_type(graph, "door")
    windows = _of_type(graph, "window")
    obstructors = [obj for obj in graph.objects if obj.category == "furniture" and obj.type != "rug"]
    room = graph.room
    stock_items = [(obj, _stock_count(obj)) for obj in graph.objects if _stock_count(obj) is not None]

    if any(term in q for term in ("sells the most", "selling most", "best selling", "fastest", "sales")):
        fastest = max(inventory, key=lambda item: item["daily_sales"], default=None)
        if fastest is not None:
            obj = _object_by_id(graph, fastest["shelf_id"])
            return AskResult(
                reply=f'{fastest["name"]} sells the fastest at {fastest["daily_sales"]} units per day. Current stock is {fastest["current_stock"]}; reorder {fastest["reorder_quantity"]} from {fastest["supplier"]}.',
                highlight_ids=[fastest["shelf_id"]] if obj else [],
            )
    if any(term in q for term in ("sells the least", "selling least", "slowest", "least moving")):
        slowest = min(inventory, key=lambda item: item["daily_sales"], default=None)
        if slowest is not None:
            obj = _object_by_id(graph, slowest["shelf_id"])
            return AskResult(
                reply=f'{slowest["name"]} is the slowest-moving item at {slowest["daily_sales"]} units per day. Consider a lower-priority shelf position.',
                highlight_ids=[slowest["shelf_id"]] if obj else [],
            )
    if any(term in q for term in ("supplier", "vendor", "buy from")):
        names = "; ".join(f'{item["name"]}: {item["supplier"]}' for item in inventory)
        return AskResult(reply=f"Supplier list: {names}.", highlight_ids=[])
    if any(term in q for term in ("margin", "profit", "profitable")):
        best = max(inventory, key=lambda item: item["margin_percent"])
        return AskResult(
            reply=f'{best["name"]} has the highest margin at {best["margin_percent"]}%.',
            highlight_ids=[best["shelf_id"]],
        )
    if any(term in q for term in ("low stock", "low inventory", "running low", "restock plan", "stock plan")):
        low = [item for item in inventory if item["current_stock"] <= item["reorder_point"]]
        names = ", ".join(f'{item["name"]} ({item["current_stock"]} left)' for item in low) or "none"
        return AskResult(
            reply=f"Low-stock items: {names}. Prioritize rice and other critical items before the next selling period.",
            highlight_ids=[item["shelf_id"] for item in low],
        )
    if any(term in q for term in ("eye level", "placement", "move to")):
        candidates = sorted(inventory, key=lambda item: item["margin_percent"] * item["daily_sales"], reverse=True)[:2]
        names = ", ".join(item["name"] for item in candidates) or "the fastest-moving products"
        return AskResult(
            reply=f"Place {names} at eye level near the entrance or counter for visibility.",
            highlight_ids=[item["shelf_id"] for item in candidates],
        )
    if "rice" in q:
        return AskResult(
            reply="Rice Bags are critical at 3 units. Reorder 9 units to reach the reorder point.",
            highlight_ids=_product_highlights(graph, "rice", "rice-shelf"),
        )
    if "oil" in q:
        return AskResult(
            reply="Cooking Oil is healthy at 18 units. Highlighting the oil shelf.",
            highlight_ids=_product_highlights(graph, "oil", "oil-shelf"),
        )
    if "dal" in q:
        return AskResult(
            reply="Toor Dal is at warning stock with 6 units. Highlighting the dal shelf.",
            highlight_ids=_product_highlights(graph, "dal", "dal-shelf"),
        )
    if "soap" in q:
        return AskResult(
            reply="Soap Packets are at warning stock with 5 units. Highlighting the soap shelf.",
            highlight_ids=_product_highlights(graph, "soap", "soap-shelf"),
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


def _product_highlights(graph: SceneGraph, keyword: str, shelf_id: str) -> list[str]:
    ids = [obj.id for obj in graph.objects if keyword in obj.label.lower()]
    if shelf_id in {obj.id for obj in graph.objects}:
        ids.insert(0, shelf_id)
    return ids


def _stock_count(obj: SceneObject) -> int | None:
    match = re.search(r"\b(\d+)\s+units?\b", obj.label.lower())
    if match:
        return int(match.group(1))
    if obj.label.lower() == "rice bag":
        return 3
    if obj.label.lower() == "oil bottle":
        return 18
    if obj.label.lower() == "dal packet":
        return 6
    if obj.label.lower() == "soap pack":
        return 5
    return None


def _object_by_id(graph: SceneGraph, object_id: str) -> SceneObject | None:
    return next((obj for obj in graph.objects if obj.id == object_id), None)
