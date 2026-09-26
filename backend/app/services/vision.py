from __future__ import annotations

from app.models import VisionDetection, VisionResult


def analyze_shelf(filename: str | None = None) -> VisionResult:
    """Mock-first vision response; replace this implementation without changing the API."""
    return VisionResult(
        filename=filename,
        detections=[
            VisionDetection(label="rice bag", confidence=0.96, box=(0.08, 0.18, 0.28, 0.62)),
            VisionDetection(label="cooking oil", confidence=0.91, box=(0.39, 0.2, 0.58, 0.66)),
            VisionDetection(label="dal packet", confidence=0.88, box=(0.68, 0.22, 0.9, 0.64)),
        ],
    )
