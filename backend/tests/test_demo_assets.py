import math

import pytest

from app.fixtures import demo_twin_graph


def test_demo_chairs_face_tables_and_equipment_rests_on_supports():
    objects = {obj.id: obj for obj in demo_twin_graph().objects}
    for i in range(1, 7):
        chair = objects[f'chair-{i}']
        table = objects[f'table-{(i + 1) // 2}']
        angle = chair.rotation[1]
        dx = table.position[0] - chair.position[0]
        dz = table.position[2] - chair.position[2]
        assert math.sin(angle) * dx + math.cos(angle) * dz > 0
    for item, support in [('monitor-1', 'bar-counter'), ('coffee-machine', 'bar-counter'), ('laptop-1', 'left-table-1')]:
        obj, top = objects[item], objects[support]
        assert obj.position[1] - obj.size[1] / 2 == pytest.approx(top.position[1] + top.size[1] / 2)
    assert objects['shelf-1'].rotation[1] == pytest.approx(-math.pi / 2)
