from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Vec3 = tuple[float, float, float]
Category = Literal["structure", "furniture", "opening", "equipment"]


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class Room(ApiModel):
    id: str = "room-1"
    name: str = "meeting room"
    width: float
    depth: float
    height: float
    units: Literal["m"] = "m"


class SceneObject(ApiModel):
    id: str
    type: str
    label: str
    category: Category = "furniture"
    position: Vec3
    size: Vec3
    rotation: Vec3 | None = None
    material: str | None = None
    confidence: float | None = None
    color: str | None = None
    shape: str | None = None
    asset_id: str | None = None


class SceneGraph(ApiModel):
    source: Literal["demo", "roomplan", "simulated"] = "demo"
    room: Room
    objects: list[SceneObject]


class CaptureObject(ApiModel):
    id: str
    position: Vec3
    size: Vec3
    rotation: Vec3 | None = None
    type: str | None = None
    label: str | None = None
    category: Category | None = None
    material: str | None = None
    color: str | None = None


class IngestRequest(ApiModel):
    room: Room | None = None
    objects: list[CaptureObject] | None = None
    source: str = "demo"


class ReconstructRequest(ApiModel):
    graph: SceneGraph


class AnalysisStep(ApiModel):
    origin: str = Field(alias="from")
    to: str


class ReconstructResult(ApiModel):
    graph: SceneGraph
    analysis_steps: list[AnalysisStep]


class AskRequest(ApiModel):
    graph: SceneGraph
    question: str


class AskResult(ApiModel):
    reply: str
    highlight_ids: list[str]


class PlacementRequest(ApiModel):
    graph: SceneGraph
    item: str | None = None
    quantity: int | None = Field(default=None, ge=1)


class PlacementRecommendation(ApiModel):
    object_id: str | None = None
    location: str
    reason: str
    score: float = Field(ge=0, le=1)


class PlacementResult(ApiModel):
    summary: str
    recommendations: list[PlacementRecommendation]
    highlight_ids: list[str] = Field(default_factory=list)


class VisionDetection(ApiModel):
    label: str
    confidence: float = Field(ge=0, le=1)
    box: tuple[float, float, float, float]


class VisionResult(ApiModel):
    mode: str = "mock"
    filename: str | None = None
    detections: list[VisionDetection]
