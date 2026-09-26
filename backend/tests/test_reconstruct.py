from __future__ import annotations

from app.models import CaptureObject, IngestRequest, Room, SceneGraph, SceneObject
from app.services.ingest import ingest_capture
from app.services.reconstruct import reconstruct_scene


def test_reconstruct_preserves_custom_appearance() -> None:
    raw = ingest_capture(IngestRequest())
    raw.objects[0].color = "#467568"
    raw.objects[0].material = "stone"
    raw.objects[0].shape = "oval"
    result = reconstruct_scene(raw)
    table = result.graph.objects[0]
    assert table.color == "#467568"
    assert table.material == "stone"
    assert table.shape == "oval"
    assert table.size == raw.objects[0].size


def test_demo_contains_photo_cafe_office_and_bar_seating() -> None:
    result = reconstruct_scene(ingest_capture(IngestRequest()))
    chairs = [obj for obj in result.graph.objects if obj.type == "chair"]
    assert {chair.asset_id for chair in chairs} == {"chair_cafe", "chair_office", "stool_bar"}
    assert any(chair.color == "#eeeee6" for chair in chairs)


def test_roomplan_reconstruction_preserves_device_labels_without_demo_id_lookup() -> None:
    graph = SceneGraph(
        source="roomplan", room=Room(width=5, depth=4, height=2.6),
        objects=[SceneObject(id="table-1", type="chair", label="Captured chair", category="furniture",
                             position=(0, 0.45, 0), size=(0.5, 0.9, 0.5), rotation=(0, 1.2, 0))],
    )
    result = reconstruct_scene(graph)
    assert result.graph.model_dump()["source"] == "roomplan"
    assert result.graph.objects[0].type == "chair"
    assert result.graph.objects[0].label == "Captured chair"
    assert result.graph.objects[0].rotation == (0, 1.2, 0)


def test_catalog_model_survives_reconstruction_and_camel_case_transport() -> None:
    graph = ingest_capture(IngestRequest())
    graph.objects.append(SceneObject(id="added-sofa", type="sofa", label="Two-seat sofa", category="furniture",
                                     position=(0, 0.43, 0), size=(1.62, 0.86, 0.86), assetId="sofa_2seat"))
    result = reconstruct_scene(graph).graph
    assert result.objects[-1].type == "sofa"
    assert result.model_dump(by_alias=True)["objects"][-1]["assetId"] == "sofa_2seat"


def test_reconstruct_keeps_ids_and_labels_demo_objects() -> None:
    raw = ingest_capture(IngestRequest())
    result = reconstruct_scene(raw)

    assert [obj.id for obj in result.graph.objects] == [obj.id for obj in raw.objects]
    table = next(obj for obj in result.graph.objects if obj.id == "table-1")
    assert table.type == "table"
    assert table.label == "Café table · front"
    assert table.category == "furniture"
    assert table.asset_id == "table_cafe"
    assert table.confidence is None  # Photo estimates are not sensor confidence.

    chairs = [obj for obj in result.graph.objects if obj.type == "chair"]
    assert len(chairs) == 11
    assert result.analysis_steps
    assert {step.to for step in result.analysis_steps} >= {"Table × 5", "Chair × 11", "Door"}


def test_reconstruct_classifies_unknown_geometry_without_demo_ids() -> None:
    raw = ingest_capture(
        IngestRequest(
            room=Room(width=5.0, depth=4.0, height=2.6),
            objects=[
                    CaptureObject(id="a", position=(0, 0.38, 0), size=(2.4, 0.76, 1.2)),
                    CaptureObject(id="b", position=(0.7, 0.46, 1.1), size=(0.48, 0.92, 0.52)),
                    CaptureObject(id="c", position=(0.9, 1.05, 2.0), size=(1.0, 2.1, 0.08)),
            ],
        )
    )
    result = reconstruct_scene(raw)
    by_id = {obj.id: obj for obj in result.graph.objects}

    assert by_id["a"].type == "table"
    assert by_id["b"].type == "chair"
    assert by_id["c"].type == "door"
    assert all(obj.id in {"a", "b", "c"} for obj in result.graph.objects)


def test_simulated_reconstruction_preserves_generated_labels_without_demo_id_lookup() -> None:
    graph = SceneGraph(
        source="simulated", room=Room(width=18, depth=11.6, height=3.1),
        objects=[
            # A demo id the lookup would otherwise hijack, and a box the size heuristic would misread.
            SceneObject(id="table-1", type="sofa", label="Three-seat sofa", category="furniture",
                        position=(0, 0.43, 0), size=(2.18, 0.86, 0.86), assetId="sofa_3seat"),
            SceneObject(id="sim:store-bookshelf-1", type="shelf", label="Bookshelf", category="furniture",
                        position=(8.75, 0.9, -4.6), size=(0.8, 1.8, 0.38), rotation=(0, 1.5707963, 0)),
        ],
    )
    result = reconstruct_scene(graph)
    assert result.graph.model_dump()["source"] == "simulated"
    assert [obj.label for obj in result.graph.objects] == ["Three-seat sofa", "Bookshelf"]
    assert result.graph.objects[0].type == "sofa"
    assert result.graph.objects[1].rotation == (0, 1.5707963, 0)


def test_analysis_log_follows_the_scene_and_stays_short_enough_to_play() -> None:
    objects = [
        SceneObject(id=f"sofa-{n}", type="sofa", label="Sofa", category="furniture",
                    position=(0, 0.43, 0), size=(2.18, 0.86, 0.86))
        for n in range(3)
    ] + [
        SceneObject(id=f"plant-{n}", type="plant", label="Plant", category="furniture",
                    position=(0, 0.4, 0), size=(0.3, 0.8, 0.3))
        for n in range(9)
    ] + [
        SceneObject(id="lamp-1", type="lamp", label="Floor lamp", category="furniture",
                    position=(0, 0.8, 0), size=(0.45, 1.6, 0.45)),
    ]
    steps = reconstruct_scene(SceneGraph(source="simulated", room=Room(width=18, depth=11.6, height=3.1),
                                        objects=objects)).analysis_steps
    headings = [step.to for step in steps]
    assert "Sofa × 3" in headings
    assert "Plant × 9" in headings
    assert "Floor lamp" in headings
    assert len(steps) <= 10


def test_analysis_log_names_openings_even_in_a_crowded_scene() -> None:
    crowd = [
        SceneObject(id=f"{kind}-{n}", type=kind, label=kind.title(), category="furniture",
                    position=(0, 0.4, 0), size=(0.4, 0.8, 0.4))
        for kind, total in (("chair", 27), ("table", 18), ("plant", 10), ("shelf", 10),
                            ("laptop", 7), ("keyboard", 6), ("bin", 5), ("computer", 4))
        for n in range(total)
    ]
    crowd += [
        SceneObject(id="door-a", type="door", label="Door", category="opening",
                    position=(0, 1.05, 5.7), size=(1.1, 2.15, 0.12)),
        SceneObject(id="window-a", type="window", label="Window", category="opening",
                    position=(0, 1.75, -5.7), size=(2.4, 1.5, 0.1)),
    ]
    steps = reconstruct_scene(SceneGraph(source="simulated", room=Room(width=18, depth=11.6, height=3.1),
                                         objects=crowd)).analysis_steps
    headings = {step.to for step in steps}
    assert "Door" in headings
    assert "Window" in headings
    assert next(step.origin for step in steps if step.to == "Door") == "Unknown opening"
