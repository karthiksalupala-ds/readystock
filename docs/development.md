# Development

InteLiDar is built **test-first**. This is a hard rule, not a preference. Product and architecture: [README.md](../README.md), [design.md](../design.md). How to send a change: [CONTRIBUTING.md](../CONTRIBUTING.md).

## TDD loop

1. Write a failing test that names the behaviour.
2. Run it and confirm it fails for the **right reason** (not import errors you are about to paper over).
3. Write the smallest production change that passes.
4. Refactor only while tests stay green.
5. Repeat. Work is not done if the test was added last.

Tests written after the code are not TDD.

## What to test

Prefer domain logic:

- Scene graph queries and highlight ids
- Sweep geometry: which bearing a surface sits at, when its reveal window opens
- Ingest stripping and reconstruct classification
- Ask heuristics and reasoner id filtering
- Edit: drag eligibility, floor clamp, immutable updates
- HTTP contracts (status codes, camelCase keys, 400s)

Keep Three.js rendering tests thin. HUD **gating** (which buttons exist in `raw` / `analysing` / `twin`) is fair game. Do not snapshot the WebGL canvas.

If Vitest is missing, install it as part of the first frontend test. It is already a `devDependency`. Playwright Chromium is required once for E2E: `npx playwright install chromium`.

## Commands

From the repo root:

| Script | What |
| --- | --- |
| `npm run dev` | Vite on 5173 |
| `npm run backend` | Uvicorn on 8000, reload |
| `npm test` | launcher + frontend + backend + E2E |
| `npm run test:scripts` | Backend launcher tests |
| `npm run test:frontend` | `vitest run` |
| `npm run test:backend` | Pytest using the platform's backend virtual environment |
| `npm run test:e2e` | Playwright demo, desktop gameplay, and room import flows |
| `npm run build` | `tsc --noEmit` + Vite production bundle |
| `npm run preview` | Serve `dist/` (no API proxy) |

Watch frontend tests: `npx vitest`. Single backend file from the repository root: `npm run test:backend -- tests/test_ask.py -q`. The launcher selects the Windows or macOS/Linux virtual environment automatically; see [Desktop playable rooms](./playable-rooms.md) for Windows setup and controls.

Coverage map: [tests/AUDIT.md](../tests/AUDIT.md).

## Test layout

```text
src/scene/editScene.test.ts      # drag rules
src/scene/scanReveal.test.ts     # sweep bearings, reveal windows, easing
src/scene/scanCloud.test.ts      # return sampling
src/scene/scanAnim.test.ts       # canvas animation clock
src/scene/useScanProgress.test.ts # sweep timing, skip, reduced motion
src/api/scene.test.ts            # fetch client
src/components/Hud.test.tsx      # reconstruct / ask / edit / sweep gating
src/components/useSpecular.test.ts # glass highlight tracking
src/components/GraphicsMenu.test.tsx # quality menu behaviour
src/settings/graphics.test.ts    # presets, defaults, persistence
src/assets/*.test.ts             # furniture fitting, materials, and loading
src/player/*.test.ts             # desktop inputs, camera, and real physics
src/room/*.test.ts               # source adapters, GLB validation, normalization
src/experience/*.test.ts*        # play/import lifecycle and render preparation
src/components/ExperienceHud.test.tsx # desktop play and import gating
src/test/setup.ts                # Testing Library + jest-dom
src/test/sampleGraph.ts          # shared fixture
e2e/demo.spec.ts                 # Playwright: sweep → reconstruct → ask chairs → Edit
e2e/play.spec.ts                 # desktop movement, collisions, pause, edit preservation
e2e/import.spec.ts               # local GLB setup and gameplay without the API
scripts/backend.test.mjs         # cross-platform backend launcher
backend/tests/test_ingest.py
backend/tests/test_reconstruct.py
backend/tests/test_ask.py
backend/tests/test_api.py         # FastAPI TestClient + stub Reasoner
```

Vitest (`vite.config.ts`): jsdom, `src/**/*.test.ts{,x}`, setup file `src/test/setup.ts`. Pytest: `backend/tests` with `pythonpath = ["."]`. Playwright: `e2e/`, Chromium, `webServer` starts backend + Vite unless those ports are already up (`reuseExistingServer` off in CI).

## Seams

Use these instead of reaching through React or OpenAI:

| Seam | Use |
| --- | --- |
| `ingest_capture(IngestRequest)` | Graph shape, stripping |
| `reconstruct_scene(graph)` | Labels, analysis steps, pose preservation |
| `ask_scene(graph, question, reasoner=...)` | Highlights, 400-equivalent ValueError, stub LLM |
| `valid_highlight_ids(graph, ids)` | Filter contract |
| `create_app(reasoner=...)` | HTTP without network |
| `moveObject` / `canDragObject` | Edit rules |
| `Hud` props | Mode gating without the canvas |
| `RoomEnvironment` | Meter-scaled room bounds, colliders, and spawn shared by all room sources |
| `loadRoomFile` / `normalizeRoom` | Local static GLB validation and source-to-world conversion |
| `createPlayerSession` | Movement and collision checks with a real Rapier world |
| `ingestScene` / `reconstructScene` / `askScene` | Client paths; stub `fetch` |
| Playwright `e2e/demo.spec.ts` | Click-path only; not WebGL pixels |
| `build_reasoner()` | Key detection only; do not call live OpenAI in CI |

`Reasoner.ask` is the LLM boundary. Tests implement a fake with a canned `AskResult`.

## Adding behaviour

**New ask intent** — failing test in `test_ask.py` against `ask_scene` / `heuristic_ask`, then a small branch in [backend/app/services/ask.py](../backend/app/services/ask.py). Optionally an HTTP assertion in `test_api.py`.

**New reconstruct class** — failing test with **non-demo ids** and sizes, then a branch in `_classify_geometry`. Do not teach the viewer special ids.

**New ingest field** — add it on both Pydantic and TypeScript types, with an ingest test that either preserves or strips it on purpose.

**New edit rule** — failing Vitest in `editScene.test.ts` before touching `ViewerScene`. If the HUD copy or toggle changes, extend `Hud.test.tsx`.

**New HTTP route** — TestClient test first, then `create_app` handler that delegates to a service function. Mirror the path in `src/api/scene.test.ts` if the client grows.

**New demo click** — extend `e2e/demo.spec.ts` only for user-visible flow (button, status text, reply). Do not assert canvas pixels.

## Environment and secrets

See [getting-started.md](./getting-started.md). `.env` is gitignored. Example keys in `.env.example` must not call OpenAI (`your-openai-api-key` is treated as unset).

## Code style (practical)

- Backend: type hints, Pydantic v2, camelCase aliases via `ApiModel`.
- Frontend: strict TypeScript, no unused locals. Keep `Hud` free of fetch and graph math.
- Do not log secrets. Do not add `VITE_OPENAI_*`.

## Python packaging

[backend/pyproject.toml](../backend/pyproject.toml): package `intelidar-backend`, `requires-python >= 3.11`, extras `[dev]` = pytest. Editable install: `.venv/bin/pip install -e ".[dev]"`.
