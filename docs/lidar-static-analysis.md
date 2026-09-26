# LiDAR static analysis

Review date: 2026-09-13  
Status: Findings documented; fixes have not been implemented.

## Scope

Reviewed the native RoomPlan capture and JSON export, browser import validation and lifecycle, and downstream scene exports. This report describes the code at review time. It does not establish real-device capture accuracy or native build readiness.

## Findings

### 1. P2 — Captured rotations are incorrect in exported floor plans

**Location:** [`src/scene/exportScene.ts:156`](../src/scene/exportScene.ts#L156), with native rotation generation in [`ios/InteLiDarCapture/ScanExport.swift:182`](../ios/InteLiDarCapture/ScanExport.swift#L182).

The native exporter preserves rotations as XYZ Euler angles. The floor-plan exporter uses only the Y component, ignoring X and Z. Equivalent Euler representations can therefore produce different floor-plan geometry.

**Verified example:** A pure 135° rotation around Y decomposes into XYZ angles of approximately `[-180°, 45°, -180°]`. The SVG code emits `rotate(-45)` instead of the expected `rotate(-135)`. For a rectangular table, this turns its footprint by 90° relative to its captured orientation. The CSV rotation column also reads only the Y component.

**Impact:** Exported plans and orientation data can disagree with the captured scene even when the full 3D rotation is correct.

**Recommended fix:** Apply the full XYZ rotation to the bounding-box corners and project them onto the XZ floor plane. Define the CSV heading convention explicitly and derive it from the full rotation.

**Regression coverage:** Compare equivalent Euler representations of a non-square object, including a 135° heading. Include objects with pitch or roll so the projected footprint reflects the complete transform.

### 2. P2 — Import validation checks centres instead of complete object bounds

**Location:** [`src/scene/importCapture.ts:65`](../src/scene/importCapture.ts#L65).

The importer checks whether each object's centre is within the room, allowing a 0.25 m tolerance. It does not account for the object's size or rotation when checking containment.

**Example from the validation logic:** An object with size `[10, 1, 1]` and position `[0, 0.5, 0]` passes the individual dimension and centre checks in a room that is only 5 m wide.

**Impact:** Malformed or externally edited scan files can introduce geometry extending far outside the room. This contradicts the containment guarantee described in `docs/capture-geometry.md` and can produce inconsistent rendering and collision geometry.

**Recommended fix:** Validate the fully transformed object bounds against the room bounds, with an explicit tolerance for measurement and rounding. Account for rotation rather than checking unrotated dimensions alone.

**Regression coverage:** Reject oversized centred objects and rotated objects whose corners exceed the allowed bounds. Accept objects that fit, including those within the intended boundary tolerance.

### 3. P2 — A pending import can overwrite a newer room selection

**Location:** [`src/components/CaptureImport.tsx:19`](../src/components/CaptureImport.tsx#L19).

The file reader awaits `file.text()` and then calls `onImport` without checking whether the request is still current. Closing the dialog does not invalidate that request, and the simulated-room button remains available while the file is being read.

**Trigger:** Start a delayed file read, then close the dialog or load a simulated room before the read finishes. The original read can still complete and import its room afterward.

**Impact:** A stale result can replace the user's newer room selection. The application's import handler also clears renovation history and other room-session state.

**Recommended fix:** Track an import request identifier and invalidate it on dialog dismissal or another room selection. Apply results and errors only if their request is still current; handle Escape dismissal as well as the close button.

**Regression coverage:** Use a deferred file-read promise. Close the dialog or load a simulated room before resolving it, then verify that the stale completion does not import a room or surface a stale error.

## Verification performed

- TypeScript static checking passed: `node node_modules/typescript/bin/tsc --noEmit`.
- All 36 tests across the existing capture-import, import-validation, and scene-export suites passed:

  ```text
  node node_modules/vitest/vitest.mjs run src/scene/importCapture.test.ts src/scene/exportScene.test.ts src/components/CaptureImport.test.tsx --maxWorkers=2
  ```

- The rotation mismatch was reproduced using Three.js Euler decomposition and the actual `floorPlanSvg` function.
- The containment and stale-import findings were established by tracing the code paths; dedicated regression tests for these cases were not added during this review.
- No implementation changes were made as part of the analysis.

Passing the existing tests does not cover the cases identified above.

## Limits and documented exclusions

Native Swift compilation and actual sensor capture were not verified: this Windows environment lacks Xcode and an attached LiDAR-equipped iPhone. The repository also documents that native compilation and device validation remain outstanding.

The rectangular room approximation and omission of raw wall polygons and open passageways are documented limitations in `ios/README.md`. They are not counted as newly discovered defects in this report.
