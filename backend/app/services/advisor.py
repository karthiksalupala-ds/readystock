from __future__ import annotations

from app.models import PlacementRecommendation, PlacementRequest, PlacementResult


def advise_placement(request: PlacementRequest) -> PlacementResult:
    """Return deterministic, explainable shelf recommendations for the MVP."""
    objects = request.graph.objects
    shelves = [obj for obj in objects if obj.type == "shelf"]
    candidates = shelves or [obj for obj in objects if obj.category == "furniture"]
    item = (request.item or "stock").strip()
    quantity = request.quantity
    recommendations = [
        PlacementRecommendation(
            object_id=obj.id,
            location=obj.label,
            reason=(
                f"Place {quantity} {item} item(s) here; it is an existing storage surface."
                if quantity
                else f"Use this existing storage surface for {item}."
            ),
            score=0.9 if obj.type == "shelf" else 0.6,
        )
        for obj in candidates[:5]
    ]
    if not recommendations:
        return PlacementResult(
            summary="No suitable storage surface was found in the scene.",
            recommendations=[],
        )
    return PlacementResult(
        summary=f"Found {len(recommendations)} suitable placement surface(s) for {item}.",
        recommendations=recommendations,
        highlight_ids=[rec.object_id for rec in recommendations if rec.object_id],
    )
