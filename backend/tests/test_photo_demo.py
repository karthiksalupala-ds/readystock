import json
import math
from pathlib import Path

import pytest

from app.fixtures import demo_twin_graph
from app.services.ingest import ingest_capture
from app.services.reconstruct import reconstruct_scene


def test_photo_demo_reuses_library_and_preserves_models_through_reconstruction():
    twin = demo_twin_graph()
    assert twin.room.id == 'photo-cafe-8179'
    assert 'café' in twin.room.name.lower()
    assets = {obj.asset_id for obj in twin.objects if obj.asset_id}
    assert assets >= {'sofa_3seat', 'chair_office', 'shelf_open', 'bookshelf',
                      'cabinet_simple', 'plant_indoor_tall', 'plant_potted_small',
                      'laptop', 'monitor_desktop', 'chess_king', 'chess_pawn',
                      'table_cafe', 'stool_bar'}
    raw = ingest_capture()
    assert all(obj.type == 'unknown' for obj in raw.objects)
    rebuilt = reconstruct_scene(raw).graph
    assert [(o.id, o.asset_id) for o in rebuilt.objects] == [(o.id, o.asset_id) for o in twin.objects]
    manifest = json.loads((Path(__file__).parents[2] / 'models/manifest.json').read_text())
    by_id = {a['id']: a for a in manifest['assets']}
    for asset_id in assets:
        assert asset_id in by_id
        assert (Path(__file__).parents[2] / 'models' / by_id[asset_id]['file']).is_file()


def test_photo_demo_geometry_fits_room_and_keeps_right_aisle_clear():
    graph = demo_twin_graph()
    assert graph.room.id == 'photo-cafe-8179'
    assert len({o.id for o in graph.objects}) == len(graph.objects)
    for obj in graph.objects:
        assert all(v > 0 and math.isfinite(v) for v in obj.size)
        angle = (obj.rotation or (0, 0, 0))[1]
        w, h, d = obj.size
        ex = (abs(math.cos(angle)) * w + abs(math.sin(angle)) * d) / 2
        ez = (abs(math.sin(angle)) * w + abs(math.cos(angle)) * d) / 2
        assert abs(obj.position[0]) + ex <= graph.room.width / 2 + 0.03, obj.id
        assert abs(obj.position[2]) + ez <= graph.room.depth / 2 + 0.03, obj.id
        assert obj.position[1] - h / 2 >= -0.01, obj.id
        assert obj.position[1] + h / 2 <= graph.room.height + 0.01, obj.id
        if obj.category == 'furniture' and obj.position[1] - h / 2 < 1.8:
            assert not (obj.position[0] - ex < 2.0 and obj.position[0] + ex > 1.05), obj.id
    objects = {o.id: o for o in graph.objects}
    for piece in ['chess-king-1', 'chess-pawn-1']:
        assert objects[piece].position[1] - objects[piece].size[1] / 2 == pytest.approx(1.125 * 2.15 / 1.8)
