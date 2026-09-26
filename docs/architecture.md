# Architecture

How InteLiDar is split today, and how capture/vision are meant to plug in. Implementation map: [design.md](../design.md). HTTP: [api.md](./api.md). Graph: [scene-graph.md](./scene-graph.md). Viewer: [frontend.md](./frontend.md).

## Principle

**The semantic scene graph is the source of truth.**

Capture and vision write geometry (and later detections) into the graph. Reconstruct writes labels and materials. Ask reads the graph and returns highlight ids. The viewer renders the graph and writes positions back during edit. Nothing else is allowed to invent objects.

Do not send raw meshes to an LLM. Send the graph.

## Intended pipeline

```text
LiDAR device (RGB + depth)
        ↓
ARKit / RoomPlan
        ↓
Raw mesh + frames + bounds
        ↓
Vision (detect, segment, openings)
        ↓
Scene graph
        ↓
Reconstruct (classify, materials)     Ask (reply + highlightIds)
        ↓                                        ↓
              React Three Fiber digital twin
```

## What runs in this repo

```text
POST /scene/ingest  ──►  raw SceneGraph (demo or caller boxes)
        │
        │  user may drag furniture (same ids)
        ▼
POST /scene/reconstruct  ──►  labelled SceneGraph + analysisSteps
        │
        │  HUD plays steps, then mode = twin
        ▼
POST /scene/ask  ──►  { reply, highlightIds }
        │
        ▼
Viewer paints ids; edit still writes the twin graph
```

Native RoomPlan capture source is in [ios/](../ios/README.md); a versioned file importer loads its normalized graph directly in Safari, preserving RoomPlan labels. Native build and device verification remain pending. Ingest with an empty body still clones [backend/app/fixtures.py](../backend/app/fixtures.py) for the demo. Image-based vision remains unimplemented. See [capture.md](./capture.md).

## Process layout

```text
Browser (Vite :5173)
  src/App.tsx            state + API calls
  src/api/scene.ts       fetch POST JSON
  src/scene/ViewerScene  R3F projection
  src/scene/editScene    pure move/clamp
  src/components/Hud     chrome
           │  proxy /scene /health
           ▼
Uvicorn (FastAPI :8000)
  app/main.py            routes + CORS + dotenv
  app/models.py          Pydantic graph / DTOs
  app/services/ingest.py
  app/services/reconstruct.py
  app/services/ask.py
  app/services/reasoner.py   HeuristicReasoner | OpenAIReasoner
  app/fixtures.py        demo meeting room
```

`create_app(reasoner=...)` injects the ask backend so tests never call OpenAI.

## Layer contracts

| Layer | Input | Output | Invariants |
| --- | --- | --- | --- |
| Ingest | Optional room + capture objects | Raw graph | Ids and poses kept; type/label/material/confidence cleared |
| Reconstruct | Raw (or edited) graph | Twin graph + steps | Same object ids, same count; positions from the request |
| Ask | Twin graph + question | Reply + ids | Highlight ids ⊆ graph ids; blank question is an error |
| Viewer | Graph + mode + highlight ids + editing | Pixels + drag events | Does not create or delete objects |
| Edit | Graph + id + next xz | New graph | Only `furniture` / `equipment`; Y unchanged; clamped to room |

## Frontend state

Held in `App`, not a global store:

| State | Role |
| --- | --- |
| `mode` | `raw` \| `analysing` \| `twin` |
| `graph` | Last ingest (and raw-mode edits) |
| `twinGraph` | Last reconstruct (and twin-mode edits) |
| `analysisSteps` / `visibleStepCount` | Staged HUD log during `analysing` |
| `query` / `reply` / `highlightedIds` | Ask UI |
| `editing` / `dragging` | Edit toggle; orbit lock while pointer is down |
| `error` | Ingest / reconstruct / ask failures |

Display graph: twin graph when `mode === 'twin'`, otherwise ingest graph.

Reconstruct always posts **`graph` (ingest)**, not `twinGraph`. Edits made in raw mode are therefore what reconstruct classifies. Edits made in twin mode stay on `twinGraph` until the user reconstructs again from the raw graph.

## Reasoner

```text
build_reasoner()
  OPENAI_API_KEY looks real  →  OpenAIReasoner
  otherwise                  →  HeuristicReasoner
```

`OpenAIReasoner` sends the graph JSON and the question, demands `{"reply","highlightIds"}`, then `ask_scene` filters ids. Any SDK/JSON failure falls back to heuristics so the demo never hard-crashes.

Tests pass a `StubReasoner` / `FakeReasoner` into `create_app` or `ask_scene`.

## Coordinate system

- Metres.
- Y-up. Floor is `y = 0`.
- Origin at the **centre of the floor**.
- Object `position` is the box centre. `size` is full width, height, depth.
- Room `width` is X, `depth` is Z, `height` is Y.

The viewer builds axis-aligned boxes only. Rotation is stored on the graph but not applied in the MVP mesh.

## Trust boundaries

- The browser never holds the OpenAI key.
- CORS is limited to the Vite origin. The proxy is the supported path.
- Highlight ids from any reasoner are intersected with the graph before they reach the client.
- Reconstruct copies labels from the demo fixture **by id** for demo graphs; unknown demo ids use size heuristics. Graphs with `source: roomplan` or `source: simulated` retain their labels and bypass fixture lookup. The analysis log is derived from the graph's own type counts, ordered so openings are named even in a crowded scene, and capped so it stays short enough to play.

## Extending the pipeline

**RoomPlan import** reads normalized `.intelidar.json` exports from the native capture app, validates dimensions/poses/ids, and opens a labelled graph directly. The legacy `/scene/ingest` endpoint still strips semantics for demo/custom boxes. glTF import remains unimplemented. Contract and limitations: [capture.md](./capture.md).

**Vision** should attach `type`, `confidence`, and maybe `color` onto capture objects *or* a parallel detections array. Reconstruct can then prefer vision over box heuristics.

**LLM reconstruct** should stay behind a function that takes a graph and returns a graph plus `analysisSteps`, same as `reconstruct_scene` today, so the HUD does not change.
