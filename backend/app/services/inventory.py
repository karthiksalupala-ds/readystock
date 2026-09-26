from __future__ import annotations

import json
from pathlib import Path
from typing import TypedDict


class DemoInventoryItem(TypedDict):
    product_id: str
    name: str
    category: str
    current_stock: int
    daily_sales: int
    reorder_point: int
    reorder_quantity: int
    margin_percent: float
    supplier: str
    shelf_id: str


def load_demo_inventory() -> list[DemoInventoryItem]:
    path = Path(__file__).resolve().parents[1] / "demo_inventory.json"
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)
