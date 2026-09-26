# HTTP API

FastAPI app in [backend/app/main.py](../backend/app/main.py). Models in [backend/app/models.py](../backend/app/models.py).

Base URL in local dev:

- Direct: `http://127.0.0.1:8000`
- From the Vite app: same-origin `/scene` and `/health` (proxied)

Interactive docs while the backend is running: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

JSON uses **camelCase** on the wire (`analysisSteps`, `highlightIds`). Pydantic also accepts snake_case on input.

All scene bodies follow the [scene graph](./scene-graph.md).

## `GET /health`

Liveness. No auth.

```bash
curl -s http://127.0.0.1:8000/health
```

```json
{ "status": "ok" }
```

## `POST /scene/ingest`

Turn a capture payload into a **raw** scene graph: geometry kept, semantics stripped.

### Empty body — demo scan

```bash
curl -s -X POST http://127.0.0.1:8000/scene/ingest \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Returns the fixture meeting room (`7.4 × 5.2 × 2.8 m`) with nine objects. Every object has `type: "unknown"`. Ids stay `table-1`, `chair-1`, …, `window-1`. Openings are labelled `Unknown opening`; everything else `Unknown object`.

The frontend calls this on load with `{}`.

### Custom capture

```json
{
  "room": {
    "id": "room-x",
    "name": "lab",
    "width": 4.0,
    "depth": 3.0,
    "height": 2.5,
    "units": "m"
  },
  "objects": [
    {
      "id": "blob-1",
      "position": [1.0, 0.4, 2.0],
      "size": [2.0, 0.8, 1.0],
      "type": "table",
      "label": "Conference table",
      "category": "furniture",
      "material": "wood"
    }
  ],
  "source": "demo"
}
```

Rules:

- Omit `objects` (or send `null`) to use the demo fixture objects.
- Omit `room` while sending objects → demo room bounds with your objects.
- Incoming `type` / `label` / `material` / `confidence` are discarded.
- `category` is kept when provided; otherwise `furniture`. Door/window type or `opening` category become openings (label `Unknown opening`).
- `id`, `position`, `size`, `rotation`, `color` are preserved. Note that `color` survives even though the object is typed `unknown`.
- `source` is accepted by the model and then **ignored** — never read, never echoed. It is a placeholder, not provenance. See [capture.md](./capture.md#the-seam-post-sceneingest).
- Geometry is **not** validated against the room bounds. An object at `[500, 0, 500]` in a 4 m room is accepted as sent.
- `units` must be `"m"`; anything else is a `422`.

Response: a `SceneGraph` (see below). Status `200`.

## `POST /scene/reconstruct`

Classify a raw graph. Does not change object ids or count. Copies **positions from the request**, so raw-mode edits survive reconstruct.

```bash
curl -s -X POST http://127.0.0.1:8000/scene/reconstruct \
  -H 'Content-Type: application/json' \
  -d '{"graph": '"$(curl -s -X POST http://127.0.0.1:8000/scene/ingest -H 'Content-Type: application/json' -d '{}')"'}'
```

Request:

```json
{
  "graph": { "room": { "...": "..." }, "objects": [] }
}
```

Response `200`:

```json
{
  "graph": { "room": {}, "objects": [] },
  "analysisSteps": [
    { "from": "Unknown surface", "to": "Wall" },
    { "from": "Unknown surface", "to": "Floor" },
    { "from": "Unknown object", "to": "Table" },
    { "from": "Unknown object", "to": "Chair × 4" }
  ]
}
```

Classification:

1. If the object id exists on the demo fixture, copy fixture semantics (type, label, material, color, confidence) onto the request pose.
2. Otherwise classify by box size (door, window, monitor, table, chair, shelf, or generic object).

Analysis steps always include wall and floor, then one step per present type (chairs collapse to `Chair × N`).

## `POST /scene/ask`

Answer a natural-language question using only the supplied graph.

```json
{
  "graph": { "room": {}, "objects": [] },
  "question": "Show me all the chairs."
}
```

Response `200`:

```json
{
  "reply": "4 chairs detected around the conference table. Highlighting them in the scene.",
  "highlightIds": ["chair-1", "chair-2", "chair-3", "chair-4"]
}
```

Errors:

| Status | When |
| --- | --- |
| `400` | `question` is empty or whitespace. Detail mentions `question`. |

`highlightIds` is filtered to ids that exist on `graph.objects`. Hallucinated ids from a reasoner never reach the client.

Reasoner selection (server process, at startup):

- Real `OPENAI_API_KEY` (`sk-…`, not the example placeholder) → OpenAI JSON chat completion.
- Otherwise keyword heuristics.

Heuristic keywords (substring, case-insensitive):

| Question contains | Highlights |
| --- | --- |
| `chair` | `type === "chair"` |
| `table` | tables |
| `door` or `exit` | doors |
| `window` | windows |
| `electronic`, `equipment`, `monitor`, `display` | `category === "equipment"` |
| `obstruct`, `walkway`, `movement`, `block` | table, chair, shelf |
| anything else | no highlights; room size + object count |

OpenAI system prompt: use only the graph; return `{"reply": string, "highlightIds": string[]}`; never invent ids. On API or parse failure, heuristics run instead.

## Scene graph JSON shape

```json
{
  "room": {
    "id": "room-1",
    "name": "meeting room",
    "width": 7.4,
    "depth": 5.2,
    "height": 2.8,
    "units": "m"
  },
  "objects": [
    {
      "id": "table-1",
      "type": "table",
      "label": "Conference table",
      "category": "furniture",
      "position": [0, 0.38, 0.15],
      "size": [2.4, 0.76, 1.2],
      "rotation": null,
      "material": "wood",
      "confidence": 0.94,
      "color": "#8d5a32"
    }
  ]
}
```

`category` is one of `structure`, `furniture`, `opening`, `equipment`. `units` is always `"m"`. Vectors are length-3 numbers.

## CORS

Allowed origins: `http://localhost:5173`, `http://127.0.0.1:5173`. All methods and headers. Prefer the Vite proxy so the browser never cross-origin calls 8000.

## Frontend client

[src/api/scene.ts](../src/api/scene.ts):

```ts
ingestScene(body?: object): Promise<SceneGraph>
reconstructScene(graph: SceneGraph): Promise<ReconstructResult>
askScene(graph: SceneGraph, question: string): Promise<AskResult>
```

Non-OK responses throw with the response text. There is no retry wrapper; `App` maps failures to HUD error strings.

## Testing the contract

[backend/tests/test_api.py](../backend/tests/test_api.py) posts ingest → reconstruct → ask with a stub reasoner, asserts ghost ids are stripped, and checks blank questions return 400. Prefer extending that file when you add a route.
