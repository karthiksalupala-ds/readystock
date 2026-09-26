"""Photo-inspired café demo. Geometry is estimated from IMG_8179, not a sensor scan."""
from pathlib import Path

from app.models import SceneGraph

_DEMO_JSON = Path(__file__).with_name('cafe_scene.json').read_text(encoding='utf-8')


def demo_twin_graph() -> SceneGraph:
    # Parse afresh so edits in a request cannot mutate later demo sessions.
    return SceneGraph.model_validate_json(_DEMO_JSON)
