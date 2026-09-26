# Test suite audit

Checked against the live product: ingest → reconstruct → ask → edit/drag.

## Coverage now

| Area | Where | Notes |
| --- | --- | --- |
| Demo ingest → unknown objects, stable ids | `backend/tests/test_ingest.py` | Domain |
| Reconstruct labels + geometry heuristics | `backend/tests/test_reconstruct.py` | Domain |
| Ask chairs/door/window/equipment/obstacles + id filter | `backend/tests/test_ask.py` | Domain |
| HTTP ingest/reconstruct/ask, CORS, placeholder key | `backend/tests/test_api.py` | API |
| Furniture drag rules (floor, clamp, openings fixed) | `src/scene/editScene.test.ts` | Unit |
| Sweep geometry: bearings, beam aim, reveal windows, easing | `src/scene/scanReveal.test.ts` | Unit |
| Return-cloud sampling: on-surface, deterministic, windowed | `src/scene/scanCloud.test.ts` | Unit |
| Sweep clock: timing, skip, reduced motion | `src/scene/useScanProgress.test.ts` | Unit |
| Canvas animation clock defaults and rate limiting | `src/scene/scanAnim.test.ts` | Unit |
| Glass specular tracking (`--gx` / `--gy`) | `src/components/useSpecular.test.ts` | Unit |
| Graphics presets, defaults, persistence, corrupt storage | `src/settings/graphics.test.ts` | Unit |
| Graphics menu: open/close, switches, presets, escape, click-away | `src/components/GraphicsMenu.test.tsx` | Component |
| HUD gating (raw/sweeping/analysing/twin), progressive list, row selection | `src/components/Hud.test.tsx` | Component |
| Frontend API client paths and errors | `src/api/scene.test.ts` | Unit |
| Serverless path rewriting, both host behaviours | `backend/tests/test_asgi.py` | Unit |
| Simulated floor: layout inside the shell, no overlap, nothing floating, catalogue-only models, open aisle | `src/scene/simulatedCapture.test.ts` | Unit |
| Capture formats: roomplan + simulated pairs, `assetId` against the library, malformed rejection | `src/scene/importCapture.test.ts` | Unit |
| Room scale: measured vs simulated, framing, shadow extent, ceiling lamps, label budget | `src/scene/roomScale.test.ts` | Unit |
| Import dialog: simulated load, file import, unreadable file keeps the scene | `src/components/CaptureImport.test.tsx` | Component |
| Labelled sources keep their labels; analysis log follows the scene and names openings | `backend/tests/test_reconstruct.py` | Unit |
| Demo E2E: sweep → skip → reconstruct → ask chairs → Edit | `e2e/demo.spec.ts` | Playwright |
| Simulated E2E: load without a device → reconstruct → ask → renovate, and the saved file re-imports | `e2e/simulated.spec.ts` | Playwright |
| Export: capture round trip, provenance, CSV quoting, plan escaping/rotation/labelling, filenames | `src/scene/exportScene.test.ts` | Unit |
| Export model: pose, rotation, extras, shared materials, glTF 2 structure the room importer accepts | `src/scene/exportModel.test.ts` | Unit |
| Export panel: each format saves under the room name, and a failure reports instead of saving | `src/components/ExportPanel.test.tsx` | Component |
| Export E2E: all four downloads, a scan file re-imports with its renovation, a model reopens as a room | `e2e/export.spec.ts` | Playwright |
| Reduced motion skips the sweep end to end | `e2e/demo.spec.ts` | Playwright |
| Graphics menu drops effects, persists across reload, keeps the demo working | `e2e/demo.spec.ts` | Playwright |

Run everything with `npm test` (Vitest, pytest, Playwright). How to add tests: [docs/development.md](../docs/development.md).

## Gaps that were closed

1. No E2E for the demo click-path.
2. HUD reconstruct/ask/edit gating untested.
3. `src/api/scene.ts` untested.
4. Window and equipment ask heuristics unimplemented in tests.
5. CORS allow-list untested.
6. `npm test` did not include E2E.

## Still out of scope

- Rendering of the simulated floor at full density. Its geometry, provenance, labelling and click-path are tested; that
  ~100 catalogue models actually resolve on screen was confirmed by running the app, not by a test.
- WebKit/iOS Safari. `e2e/capture.spec.ts` and `e2e/renovation.spec.ts` target the `webkit-iphone` project; they were last
  verified here on Chromium mobile emulation because this container ships no WebKit build.
- WebGL pixel-drag of a chair (flaky in headless Chromium). Edit is covered by the toggle, hint, and `editScene` unit tests.
- Live OpenAI network calls (stubbed / heuristic only).
- Canvas visual regression. The sweep is covered as geometry (`scanReveal`, `scanCloud`) and as gating (`Hud`, E2E), never as pixels.
- Shader compilation. `ScanPoints` and `SensorBeacon` are checked by running the app, not by a test.
