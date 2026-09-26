from __future__ import annotations

from app.fixtures import demo_twin_graph
from app.models import CaptureObject, IngestRequest, SceneGraph, SceneObject


def ingest_capture(request: IngestRequest | None = None) -> SceneGraph:
    payload = request or IngestRequest()
    if payload.objects is None:
        twin = demo_twin_graph()
        return SceneGraph(room=twin.room, objects=[_strip(obj) for obj in twin.objects])

    room = payload.room or demo_twin_graph().room
    return SceneGraph(room=room, objects=[_strip(obj) for obj in payload.objects])


def _strip(obj: CaptureObject | SceneObject) -> SceneObject:
    opening = obj.category == "opening" or (obj.type or "") in {"door", "window"}
    return SceneObject(
        id=obj.id,
        type="unknown",
        label="Unknown opening" if opening else "Unknown object",
        category="opening" if opening else (obj.category or "furniture"),
        position=obj.position,
        size=obj.size,
        rotation=obj.rotation,
        material=None,
        confidence=None,
        color=getattr(obj, "color", None),
    )
