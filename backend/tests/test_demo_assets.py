"""
Sanity checks for the ReadyStock kirana demo scene geometry.
Replaces the old cafe-chair/table facing tests with kirana-specific assertions.
"""
import pytest

from app.fixtures import demo_twin_graph


def test_billing_equipment_rests_on_counter():
    """POS monitor, keyboard, and CPU should sit on top of the billing counter."""
    objects = {obj.id: obj for obj in demo_twin_graph().objects}
    counter = objects["billing-counter"]
    counter_top = counter.position[1] + counter.size[1] / 2
    for item_id in ("pos-monitor", "pos-keyboard", "pos-cpu"):
        obj = objects[item_id]
        base = obj.position[1] - obj.size[1] / 2
        assert base == pytest.approx(counter_top, abs=0.05), (
            f"{item_id} base {base:.3f} should be near counter top {counter_top:.3f}"
        )


def test_kirana_scene_has_expected_ids():
    """Key kirana objects must be present."""
    objects = {obj.id: obj for obj in demo_twin_graph().objects}
    required = {
        "rice-shelf", "oil-shelf", "dal-shelf", "soap-shelf",
        "billing-counter", "shop-entrance",
        "pos-monitor", "pos-keyboard", "pos-cpu",
        "cashier-stool", "grain-sack-cluster", "snacks-rack",
        "cold-drinks-fridge", "weighing-scale",
    }
    for oid in required:
        assert oid in objects, f"Missing expected kirana object: {oid}"


def test_shelf_racks_have_correct_asset():
    """All product shelf racks must use the registered shop shelf model."""
    for obj in demo_twin_graph().objects:
        if obj.type == "shelf" and obj.id.endswith("-shelf"):
            assert obj.asset_id == "shelf_rack_shop", (
                f"{obj.id} has unexpected asset_id: {obj.asset_id}"
            )
