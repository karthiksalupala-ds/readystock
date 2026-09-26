"""
ReadyStock kirana store demo scene tests.
These replace the old IntelIDar photo-cafe assertions with kirana-store equivalents.
"""
import json
import math
from pathlib import Path

import pytest

from app.fixtures import demo_twin_graph
from app.services.ingest import ingest_capture
from app.services.reconstruct import reconstruct_scene


def test_kirana_demo_has_correct_room_id_and_shop_models():
    """demo_twin_graph() must return the kirana store room with its shop-specific models."""
    twin = demo_twin_graph()
    assert twin.room.id == "demo-kirana-store"
    assert "kirana" in twin.room.name.lower() or "store" in twin.room.name.lower()

    assets = {obj.asset_id for obj in twin.objects if obj.asset_id}
    # All shop-specific models that should be wired in
    assert assets >= {
        "shelf_rack_shop", "counter_billing", "monitor_desktop",
        "keyboard", "computer_desktop", "stool_round",
        "cabinet_simple", "track_ceiling", "trash_bin",
        "fridge_drinks", "stand_scale", "sack_generic",
        "crate_generic", "door_simple",
    }

    # Confirm the GLB files referenced in manifest actually exist on disk
    manifest = json.loads((Path(__file__).parents[2] / "models/manifest.json").read_text())
    by_id = {a["id"]: a for a in manifest["assets"]}
    for asset_id in assets:
        assert asset_id in by_id, f"Asset {asset_id} missing from manifest"
        assert (Path(__file__).parents[2] / "models" / by_id[asset_id]["file"]).is_file(), (
            f"GLB file missing for {asset_id}"
        )


def test_kirana_demo_geometry_fits_room():
    """Every object must sit within the room bounds (±3 cm tolerance) and off the floor."""
    graph = demo_twin_graph()
    assert graph.room.id == "demo-kirana-store"
    assert len({o.id for o in graph.objects}) == len(graph.objects), "Duplicate IDs found"

    for obj in graph.objects:
        assert all(v > 0 and math.isfinite(v) for v in obj.size), f"{obj.id} has invalid size"
        angle = (obj.rotation or (0, 0, 0))[1]
        w, h, d = obj.size
        ex = (abs(math.cos(angle)) * w + abs(math.sin(angle)) * d) / 2
        ez = (abs(math.sin(angle)) * w + abs(math.cos(angle)) * d) / 2
        assert abs(obj.position[0]) + ex <= graph.room.width / 2 + 0.03, (
            f"{obj.id} extends outside room width"
        )
        assert abs(obj.position[2]) + ez <= graph.room.depth / 2 + 0.03, (
            f"{obj.id} extends outside room depth"
        )
        assert obj.position[1] - h / 2 >= -0.01, f"{obj.id} is below the floor"
        assert obj.position[1] + h / 2 <= graph.room.height + 0.01, f"{obj.id} is above the ceiling"


def test_kirana_demo_reconstruction_roundtrip():
    """Reconstructing the demo capture produces the same object list as demo_twin_graph()."""
    twin = demo_twin_graph()
    raw = ingest_capture()
    rebuilt = reconstruct_scene(raw).graph
    assert [(o.id, o.asset_id) for o in rebuilt.objects] == [(o.id, o.asset_id) for o in twin.objects]
