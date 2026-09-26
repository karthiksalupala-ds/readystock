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
