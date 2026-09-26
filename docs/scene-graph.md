# Scene graph

Canonical JSON for a room. Every layer reads or writes this shape. Types: [src/scene/types.ts](../src/scene/types.ts) (TypeScript) and [backend/app/models.py](../backend/app/models.py) (Pydantic). Keep them aligned.

Wire format is camelCase. Coordinates are metres, Y-up, origin at the floor centre. Object `position` is the **box centre**. The optional top-level `source` is `demo` (default), `roomplan`, or `simulated`. Both `roomplan` and `simulated` graphs arrive labelled and keep those labels through reconstruction instead of being re-derived by fixture id or size. Only `roomplan` suppresses the synthetic sensor effects in the viewer: a measured room had no beam in it, while a simulated floor has no device either and says so, so it keeps the sweep. The versioned file wrapper used for import is described in [ios/README.md](../ios/README.md).

## Room

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable room id. Demo: `room-1`. |
| `name` | string | Display name. Demo: `meeting room`. |
| `width` | number | Extent on **X**. |
| `depth` | number | Extent on **Z**. |
| `height` | number | Extent on **Y** (floor to ceiling). |
| `units` | `"m"` | Always metres. |

The floor rectangle is `x ∈ [-width/2, width/2]`, `z ∈ [-depth/2, depth/2]`, `y = 0`.

## Object

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable across ingest, reconstruct, ask, and edit. |
| `type` | string | Fine class: `table`, `chair`, `door`, … Raw ingest uses `unknown`. |
| `label` | string | HUD / 3D caption. |
| `category` | enum | `structure` \| `furniture` \| `opening` \| `equipment`. Drives edit rules. |
| `position` | `[x, y, z]` | Centre in metres. |
| `size` | `[sx, sy, sz]` | Full extents (not half-extents). |
| `rotation` | `[rx, ry, rz]` \| null | XYZ Euler rotation in radians, applied to the object's local full extents, rendered asset, and collider. |
| `shape` | string \| null | Optional model variant, such as table `oval` or chair `armchair`; missing/unsupported values use the type's default. |
| `material` | string \| null | `wood`, `fabric`, `glass`, `metal`, `plastic`, … |
| `confidence` | number \| null | 0–1 when known. |
| `color` | string \| null | Hex for the twin mesh. |

### Categories

| Category | Examples | Editable? |
| --- | --- | --- |
| `furniture` | table, chair, shelf | Yes — slide on floor |
| `equipment` | monitor / display | Yes — slide on floor |
| `opening` | door, window | No |
| `structure` | (reserved) | No |

`canDragObject` in [src/scene/editScene.ts](../src/scene/editScene.ts) allows only `furniture` and `equipment`.

## Demo meeting room

Defined in [backend/app/fixtures.py](../backend/app/fixtures.py). Empty ingest returns these ids with semantics stripped.

| Id | Twin type | Category | Notes |
| --- | --- | --- | --- |
| `table-1` | table | furniture | Conference table, centre |
| `chair-1` … `chair-4` | chair | furniture | Around the table |
| `monitor-1` | monitor | equipment | On the table |
| `shelf-1` | shelf | furniture | Left wall |
| `door-1` | door | opening | Far wall |
| `window-1` | window | opening | Right wall (glass) |

Room: **7.4 m × 5.2 m × 2.8 m** (`width × depth × height`).

Reconstruct **looks up these ids** and restores fixture labels while keeping the request’s pose. That is why dragging a chair in raw mode still yields a labelled chair in the same place.

## Ingest stripping

[backend/app/services/ingest.py](../backend/app/services/ingest.py):

- `type` → `unknown`
- `label` → `Unknown opening` if category is `opening` or type is `door`/`window`, else `Unknown object`
- `material`, `confidence` → `null`
- `category` kept, or inferred as `opening` / `furniture`
- Geometry and `id` unchanged

This is what makes the HUD’s unknown list honest before reconstruct.

## Reconstruct heuristics

[backend/app/services/reconstruct.py](../backend/app/services/reconstruct.py), after demo-id lookup fails.

Let `width, height, depth = size`, `thin = min(width, depth) < 0.15`, `span = max(width, depth)`.

| Condition | Type | Category | Material |
| --- | --- | --- | --- |
| thin and height ≥ 2.0 | door | opening | wood |
| thin and height ≥ 1.0 | window | opening | glass |
| thin | monitor | equipment | plastic |
| height < 0.9 and span ≥ 1.5 | table | furniture | wood |
| 0.7 ≤ height ≤ 1.2 and span ≤ 0.7 | chair | furniture | fabric |
| height ≥ 1.4 | shelf | furniture | metal |
| else | object | furniture | — |

These thresholds are the contract covered by `test_reconstruct_classifies_unknown_geometry_without_demo_ids`. Change them with a failing test first.

### Analysis steps

Always:

1. Unknown surface → Wall
2. Unknown surface → Floor

Then, if present: Table, Chair or `Chair × N` (special-case `Chair × 4`), Door, Window, Display, Shelf.

The frontend reveals one step at a time (~380 ms), then switches to `twin`.

## Ask and highlights

Ask never mutates the graph. It returns ids the viewer already knows.

Heuristic matching is **first keyword wins** (chair before table before door, …). See [api.md](./api.md).

`valid_highlight_ids` intersects the reasoner list with `{obj.id}`. Order of surviving ids is preserved.

## Edit writes

[src/scene/editScene.ts](../src/scene/editScene.ts) `moveObject`:

- Unknown id → same graph reference
- Non-draggable category → same graph
- Y forced to the object’s current Y (no lifting)
- X/Z clamped so the box stays inside the room:  
  `x ∈ [-(width/2) + sx/2, width/2 - sx/2]`  
  same for Z with `depth` and `sz`
- If min > max (object larger than the room), clamp to the midpoint

The viewer raycasts the pointer onto the y = 0 plane and calls `onMoveObject`.

## What not to put on the graph

- GPU meshes, textures, or Three.js uuids
- Chat transcripts
- Camera pose
- Transient highlight state (that lives in `App`)

Mesh URLs and vision scores can be added later as optional fields. Prefer additive changes so old clients still parse.
