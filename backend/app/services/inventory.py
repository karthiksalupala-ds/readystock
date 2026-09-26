from __future__ import annotations

import json
import os
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
    configured = os.getenv("DEMO_INVENTORY_PATH", "").strip()
    path = Path(configured) if configured else Path(__file__).resolve().parents[1] / "demo_inventory.json"
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / path
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)
