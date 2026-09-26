# Frontend

Vite + React 19 + Three.js + React Three Fiber + Drei. Entry: [index.html](../index.html) → [src/main.tsx](../src/main.tsx) → [src/App.tsx](../src/App.tsx).

The canvas is a **projection** of the scene graph. The HUD is chrome. Domain rules (drag, clamp, sweep schedule) live in `src/scene/*.ts`, not in JSX.

## File map

```text
src/
  main.tsx
  App.tsx                 # state machine + API
  index.css               # liquid-glass HUD, dark theme
  api/scene.ts            # POST helpers
  api/scene.test.ts
  components/
    Hud.tsx               # overlay UI only
    Hud.test.tsx          # mode gating, sweep gating, list selection
    GraphicsMenu.tsx      # quality presets and per-effect switches
    GraphicsMenu.test.tsx
    useSpecular.ts        # pointer-tracked highlight for glass panels
    useSpecular.test.ts
  scene/
    types.ts              # graph + mode types
    ViewerScene.tsx       # room, objects, lights, drag, twin transition
    ScanPoints.tsx        # return cloud (one draw call, shader-driven reveal)
    SensorBeacon.tsx      # the scanner, its beam and floor trace
    scanReveal.ts         # sweep geometry: bearings, windows, easing
    scanReveal.test.ts
    scanCloud.ts          # deterministic surface sampling for the cloud
    scanCloud.test.ts
    scanAnim.ts           # shared mutable animation clock
    scanAnim.test.ts
    useScanProgress.ts    # drives the sweep, honours reduced motion
    useScanProgress.test.ts
    editScene.ts          # canDragObject, moveObject
    editScene.test.ts
  settings/
    graphics.ts           # presets, defaults, persistence, pixel ratio
    graphics.test.ts
    useGraphics.ts        # settings state, remembered per device
  test/
    setup.ts              # Testing Library cleanup
    sampleGraph.ts
```

Vite proxies `/scene` and `/health` to `http://127.0.0.1:8000` ([vite.config.ts](../vite.config.ts)). Vitest uses **jsdom** and includes `src/**/*.test.ts{,x}`. Demo click-path: [e2e/demo.spec.ts](../e2e/demo.spec.ts).

## Modes

| Mode | Canvas | HUD |
| --- | --- | --- |
| `raw`, sweeping | Sensor beam turning, returns accumulating, boxes resolving as the beam passes | Capture readout with progress and Skip; reconstruct and edit withheld |
| `raw`, swept | Settled point cloud, wireframe room and boxes | Reconstruct CTA, object list as `unknown`, ask disabled |
| `analysing` | Same as swept, wireframes tinted toward the reasoner's blue | Classification log; edit forced off |
| `twin` | Lit materials, glass, labels; cloud dissolved | Ask enabled, object types and confidence shown |

`displayGraph` is `twinGraph` in twin mode, otherwise the ingest `graph`. The reconstruct result lands on `twinGraph` immediately, but the canvas stays on the raw graph until the log finishes and `mode` becomes `twin`.

## The opening sweep

Nothing appears at once. The sensor sits mid-room at eye height and turns through one full revolution; every surface resolves when the beam reaches its bearing.

The sweep is **presentation, not measurement**. It runs in the browser after ingest has already returned a complete graph, and re-orders how that graph appears. There is no scanner behind it — see [capture.md](./capture.md) before describing it as live.

[src/scene/scanReveal.ts](../src/scene/scanReveal.ts) owns the geometry and is the part worth testing:

- `scanBearing(x, z, origin)` — position on the turn, `0` at +Z, `0.25` at +X.
- `beamRotationY(progress)` — Y rotation that aims a group's local +X along the beam. One turn per `SWEEP_SPAN` (0.82) of the timeline.
- `revealWindowFor(bearing)` — `{ start, end }`, opening when the beam arrives and closing `REVEAL_SPAN` (0.18) later. The last bearing finishes at exactly 1.
- `revealAmount(progress, window)` — eased 0 → 1, cubic ease-out.
- `revealedObjects(graph, progress)` — what the HUD may list, in graph order.
- `materialiseWindow(index, count)` — the same idea applied to the twin transition, staggered so objects gain materials one after another.

[src/scene/useScanProgress.ts](../src/scene/useScanProgress.ts) turns that into wall-clock progress over `SCAN_DURATION_MS` (4.6 s), quantised to 1% so the HUD does not re-render every frame. `skip()` jumps to a finished scan. A duration of **0** hands over a finished scan immediately, which is how the Animation setting switches the sweep off; the hook itself does not read `prefers-reduced-motion`, so an explicit choice always wins. See [Graphics settings](#graphics-settings).

### Return cloud

[src/scene/scanCloud.ts](../src/scene/scanCloud.ts) samples returns over the room shell and over each object's box, seeded from the object id so the same room always scans the same way. Each return carries its own reveal window (plus a little jitter, so the leading edge is not a ruler).

[src/scene/ScanPoints.tsx](../src/scene/ScanPoints.tsx) draws them as one `THREE.Points` per owner with a `ShaderMaterial`: the vertex stage compares the return's window against `uProgress`, so a whole cloud resolves in a single draw call with no per-frame CPU work. Object clouds live in the object's local space and therefore travel with it when dragged.

### Animation clock

[src/scene/scanAnim.ts](../src/scene/scanAnim.ts) is one mutable object (`scan`, `twin`, `cloud`, `think`, `time`) written by a single `useFrame(..., -1)` in `ViewerScene` and read by every child in its own frame callback. Animation writes straight to materials and transforms, so a four-second sweep costs no React renders.

`twin` is driven from `state.clock.elapsedTime`, not accumulated deltas: a slow first frame must not stretch the materialisation, and a stalled one must not leave it half applied.

## Graphics settings

Every effect the sweep and the glass HUD rely on is optional. [src/settings/graphics.ts](../src/settings/graphics.ts) owns the shape and the presets; [GraphicsMenu](../src/components/GraphicsMenu.tsx) is the popover in the top bar.

| Setting | Turns off | Reached by |
| --- | --- | --- |
| `shadows` | `castShadow` on the key light, so no shadow map is rendered | `ViewerScene` |
| `pointCloud` | Every `ScanPoints` cloud; the raw wireframe brightens to carry the scan alone | `ViewerScene`, `SceneMesh` |
| `beam` | The fan, its trail and the floor pulse. The scanner head stays — it is the cause of the sweep | `SensorBeacon` |
| `glassBlur` | `backdrop-filter` on every panel and 3D label; panels go opaque instead | `[data-glass='off']` in CSS |
| `fullResolution` | Caps the canvas at `dpr` 1 instead of the display's own ratio | `dprFor()` → `<Canvas dpr>` |
| `motion` | The sweep (duration 0), the twin materialisation (instant), and all CSS animation | `useScanProgress`, `ViewerScene`, `[data-motion='off']` |

Presets are `high` (everything), `balanced` (shadows and pixel ratio off) and `low` (nothing). `activePreset()` reports `custom` for any other mix, so no preset shows as pressed.

Settings are read once on mount from `localStorage` and written on change. **`prefers-reduced-motion: reduce` only supplies the first-run default for `motion`**; a saved choice beats it, so switching animation back on means what it says. Corrupt, partial, or hostile stored JSON falls back field by field, and storage that throws is treated as absent.

The rule for anything added here: it must cost frames and carry no meaning. The room, the labels, reconstruct and ask all work identically at `low`.

## HUD surfaces

[src/components/Hud.tsx](../src/components/Hud.tsx)

- **Top bar** — brand with a sweeping LiDAR mark, Edit toggle, status pill (`Demo playback` / `Raw mesh` / `Analysing scene` / `Semantic twin`), and the Graphics menu. The menu is last in the row so its popover cannot overhang a narrow viewport, and it stays live in every mode, including mid-sweep, which is when someone notices the lag.
- **Left panel** — room name, size, object count, source line, object list. During the sweep, undetected objects are held open as `.ghost` placeholders so the list never jumps.
- **Object rows** — buttons. Clicking one highlights that object in the canvas; rows carry `aria-pressed` and light up for ask results too.
- **Centre stage** — capture readout while sweeping, Reconstruct CTA once swept, the analysis `<ol>` in `analysing`, nothing in `twin`
- **Ask bar** — input, submit, three suggestions, reply, error. Each non-empty reply has a **Read aloud** button using browser speech synthesis; it becomes **Stop reading** during playback. Speech starts only on a click and stops when the reply changes or the HUD closes. Unsupported browsers show a disabled control and an explanation; playback failures can be retried. Voice availability and sound depend on the browser/device.

Edit hint when the toggle is on: *Drag tables, chairs, and equipment. Doors and windows stay fixed.*

Pointer events: the HUD root is `pointer-events: none`; children opt back in so orbit works on the canvas. `.scrim` and `.stage` opt back out so they do not swallow drags.

## Styling

[src/index.css](../src/index.css). Every floating surface is `.glass`: a blurred backdrop, a translucent fill, a masked gradient rim that catches light on the top edge, and a specular highlight that follows the pointer. The highlight comes from [`useSpecular`](../src/components/useSpecular.ts), which writes `--gx` / `--gy` / `--glass-shine` onto the element it is spread across. Add new panels to `.glass` rather than inventing a fifth kind of surface.

Outfit + IBM Plex Mono (loaded in `index.html`), accent `#3ee0c2`. Panels enter with a springy `cubic-bezier`; everything animated is disabled under `prefers-reduced-motion: reduce`. Prefer visual checks in the browser after layout tweaks; HUD **gating** is covered in `Hud.test.tsx`.

## Viewer

[src/scene/ViewerScene.tsx](../src/scene/ViewerScene.tsx)

- Camera starts at `[6.4, 4.2, 6.8]`, fov 42, shadows on (`percentage`).
- `OrbitControls`: damping, polar limit, distance 3–16, target `[0, 1, 0]`. Disabled while `dragging`, auto-rotating slowly while sweeping.
- `RoomShell` renders **two** shells in the same place: the measured wireframe and the surfaced twin. The sweep fades the first in; the twin transition cross-fades to the second, then drops `transparent` so shadows stay crisp.
- The twin ceiling faces inward only, so a camera above the room looks straight in instead of through a lid.
- Each graph object renders a wireframe box and return cloud, then a detailed model cross-faded by `revealAmount`. `buildFurnitureModel.ts` builds tables, chairs, shelves, monitors, doors, and windows within the measured bounding volume, with rounded edges and individual construction details. Unknown types retain a box fallback. Object rotation applies to the full group.
- `modelMaterials.ts` generates seamless neutral texture and bump maps for wood, fabric, leather, brushed metal, plastic, and stone. Primary surfaces use `object.color` independently of finish. Hardware retains its own finish; window glass has separate tint and transparency. Geometry and textures are disposed when models are replaced, and moving an object does not rebuild them.
- Highlights set a pulsing teal emissive and a `.label-hot` HTML caption. Labels fade in on the object's own materialise delay.
- Fallback room if `graph` is null: same dimensions as the demo fixture, so the shell still renders while ingest is in flight.

### Highlight vs edit emissive

Highlighted objects use a strong pulsing teal emissive. Draggable objects in edit mode use a weaker steady one, so they read as movable without looking like ask results.

## Edit interaction

In twin mode, **Appearance** provides an object selector (also available on narrow screens), type-specific shapes, material choices, a custom color picker, and preset swatches. `updateAppearance` accepts valid changes to one object, preserving ids, position, and dimensions. Edits remain in the current graph and are sent to the spatial assistant; they are not saved across a page reload. Drag bounds account for rotation.

1. User toggles Edit (`mode !== 'analysing'`, sweep finished, graph loaded).
2. Hover on a draggable mesh → `grab`. Pointer down → `dragging = true`, orbit off, `grabbing`.
3. `pointermove` on `window` raycasts to the y = 0 plane and calls `moveObject` through `onMoveObject`.
4. Pointer up clears dragging.

`App.onMoveObject` writes `twinGraph` in twin mode and `graph` otherwise. Reconstruct is always called with the ingest `graph`, so twin-mode drags are not sent until a future reconstruct-from-twin exists.

## API wiring

On mount: `ingestScene()` → `setGraph`, which arms the sweep. Failure → *Backend unavailable. Start the API on port 8000.* and **no** capture readout: with no graph there is nothing to scan.

Reconstruct: `reconstructScene(graph)` → `twinGraph` + `analysisSteps` → `mode = 'analysing'`. Timers reveal steps; last step + 700 ms → `twin`, and the materialisation runs for `TWIN_DURATION_MS`. Failure → *Reconstruct failed.*

Ask: only if `mode === 'twin'` and `twinGraph` and non-empty question. Sets `reply` and `highlightedIds`. Failure → *Ask failed.*

## What to test (and what not to)

Do not snapshot WebGL. Cover:

- `scanReveal` / `scanCloud` / `scanAnim` — sweep geometry, sampling, easing
- `useScanProgress` — timing, skip, a disabled sweep
- `graphics` — presets, defaults, persistence, hostile stored JSON
- `GraphicsMenu` — open/close, switch state, presets, escape and click-away
- `canDragObject` / `moveObject`
- `Hud` enabled/disabled controls per mode and per sweep state
- API client paths (`src/api/scene.test.ts`)
- Demo click-path in Playwright (sweep → skip → reconstruct → ask chairs → Edit)

If you extract more viewer logic, test that function, not `ViewerScene`. Pointer-drag of a chair in headless Chromium is out of scope; unit tests own the clamp math.
